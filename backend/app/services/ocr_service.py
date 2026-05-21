"""图片识别服务 — 单步方案：视觉模型直接提取结构化 JSON"""
import base64
import json
import os
import io
import dashscope
from dashscope import MultiModalConversation

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "sk-95d613890a4a4c4db293d62dbebfb163")
dashscope.api_key = DASHSCOPE_API_KEY

INDICATOR_NAMES = [
    "肉眼可见物", "浑浊度", "色度", "pH",
    "COD", "菌落总数", "总大肠菌群", "游离余氯", "臭和味",
]

SYSTEM_PROMPT = """你是水质检测报告数据录入助手。你的任务是从水质检测报告图片中提取每个采样点的检测数据。

报告是表格形式：
- 行：采样点名称（如"一期供水站"、"一期航站楼"、"二期航站楼"等）
- 列：检测指标（肉眼可见物、浑浊度、色度、pH、COD/耗氧量、菌落总数、总大肠菌群、游离余氯、臭和味）

提取规则：
1. 完全按照图片中填写的内容抄写，不要修改数值
2. 文字值如"无"、"合格"、"未检出"、"无异臭异味"等保持原样
3. 空单元格填空字符串 ""
4. COD指标在报告中可能写"耗氧量"、"COD(Mn)"、"CODmn"、"高锰酸盐指数"

你必须只返回一个 JSON 对象，格式如下（注意：COD 是化学需氧量/耗氧量指标）：
{
  "采样点名称": {
    "肉眼可见物": "无",
    "浑浊度": "0.4",
    "色度": "1.2",
    "pH": "7.8",
    "COD": "合格",
    "菌落总数": "未检出",
    "总大肠菌群": "未检出",
    "游离余氯": "0.5",
    "臭和味": "无异臭、异味"
  }
}

不要添加任何解释文字，只返回JSON。"""


def _compress_image(image_path: str, max_size_kb: int = 500) -> str:
    """压缩图片并返回 base64 data URL"""
    try:
        from PIL import Image
        img = Image.open(image_path)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        w, h = img.size
        max_dim = 2048
        if w > max_dim or h > max_dim:
            ratio = max_dim / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        quality = 85
        buf = io.BytesIO()
        while quality >= 40:
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=quality)
            if buf.tell() / 1024 <= max_size_kb:
                break
            quality -= 10
        return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
    except ImportError:
        with open(image_path, "rb") as f:
            ext = os.path.splitext(image_path)[1].lower().replace('.', '')
            mime = 'jpeg' if ext in ('jpg', 'jpeg') else ext
            return f"data:image/{mime};base64,{base64.b64encode(f.read()).decode('utf-8')}"


def recognize_report(image_path: str) -> dict:
    """识别检测报告图片，返回 {采样点名称: {指标名: 值}}"""
    img_url = _compress_image(image_path)

    messages = [{
        "role": "system",
        "content": [{"text": SYSTEM_PROMPT}],
    }, {
        "role": "user",
        "content": [
            {"image": img_url},
            {"text": "请提取这份水质检测报告中所有采样点的检测数据，返回JSON。"},
        ],
    }]

    response = MultiModalConversation.call(
        model="qwen-vl-max",
        messages=messages,
        temperature=0.1,
        max_tokens=4000,
    )

    content = ""
    for item in response.output.choices[0].message.content:
        if isinstance(item, dict) and "text" in item:
            content += item["text"]

    # Debug: save raw response
    import tempfile
    debug_path = os.path.join(tempfile.gettempdir(), "_ocr_debug.txt")
    with open(debug_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[OCR DEBUG] Raw response saved to {debug_path}")

    # Parse JSON from response
    content = content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:]) if lines[0].startswith("```") else content
        if content.endswith("```"):
            content = content[:-3].strip()

    return json.loads(content)
