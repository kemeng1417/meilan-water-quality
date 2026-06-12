"""Convert user manual markdown to PDF using reportlab"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.colors import HexColor
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import re, os

# Register Chinese fonts
pdfmetrics.registerFont(TTFont('MSYH', 'C:/Windows/Fonts/msyh.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('MSYHB', 'C:/Windows/Fonts/msyhbd.ttc', subfontIndex=0))

WIDTH, HEIGHT = A4

class PDFManual:
    def __init__(self, output_path):
        self.output = output_path
        self.story = []
        self._setup_styles()

    def _setup_styles(self):
        s = {}
        s['title'] = ParagraphStyle('title', fontName='MSYHB', fontSize=22, leading=30,
                                     alignment=TA_CENTER, textColor=HexColor('#0e7490'), spaceAfter=6)
        s['subtitle'] = ParagraphStyle('subtitle', fontName='MSYH', fontSize=10, leading=14,
                                        alignment=TA_CENTER, textColor=HexColor('#94a3b8'), spaceAfter=20)
        s['h1'] = ParagraphStyle('h1', fontName='MSYHB', fontSize=18, leading=26,
                                  textColor=HexColor('#0e7490'), spaceBefore=28, spaceAfter=12)
        s['h2'] = ParagraphStyle('h2', fontName='MSYHB', fontSize=15, leading=22,
                                  textColor=HexColor('#0e7490'), spaceBefore=20, spaceAfter=8)
        s['h3'] = ParagraphStyle('h3', fontName='MSYHB', fontSize=12, leading=18,
                                  textColor=HexColor('#475569'), spaceBefore=14, spaceAfter=6)
        s['body'] = ParagraphStyle('body', fontName='MSYH', fontSize=11, leading=20,
                                    textColor=HexColor('#334155'), spaceAfter=8)
        s['code'] = ParagraphStyle('code', fontName='MSYH', fontSize=9.5, leading=16,
                                    backColor=HexColor('#f5f5f5'), textColor=HexColor('#475569'),
                                    leftIndent=10, rightIndent=10, spaceAfter=6)
        s['th'] = ParagraphStyle('th', fontName='MSYHB', fontSize=10, leading=14,
                                  textColor=HexColor('#334155'))
        s['td'] = ParagraphStyle('td', fontName='MSYH', fontSize=10, leading=14,
                                  textColor=HexColor('#475569'))
        s['bullet'] = ParagraphStyle('bullet', fontName='MSYH', fontSize=11, leading=21,
                                      textColor=HexColor('#334155'), leftIndent=22,
                                      bulletIndent=8, spaceAfter=3)
        s['toc'] = ParagraphStyle('toc', fontName='MSYH', fontSize=12, leading=26,
                                   textColor=HexColor('#334155'), leftIndent=30)
        self.styles = s

    def _format_text(self, text):
        """Convert markdown bold and code to reportlab XML"""
        text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        text = re.sub(r'\*\*(.+?)\*\*', r'<font face="MSYHB" color="#0e7490"><b>\1</b></font>', text)
        text = re.sub(r'`([^`]+)`', r'<font face="MSYH" color="#0e7490">\1</font>', text)
        return text

    def add_title_page(self):
        self.story.append(Spacer(1, 3*cm))
        self.story.append(Paragraph('美兰机场供水站', self.styles['title']))
        self.story.append(Paragraph('水质管理系统', self.styles['title']))
        self.story.append(Spacer(1, 0.8*cm))
        self.story.append(Paragraph('用 户 操 作 手 册', self.styles['title']))
        self.story.append(Spacer(1, 1.5*cm))
        self.story.append(Paragraph('版本 1.0  |  2026年6月', self.styles['subtitle']))
        self.story.append(Paragraph('美兰机场供水站 编制', self.styles['subtitle']))
        self.story.append(PageBreak())

    def add_toc(self):
        self.story.append(Paragraph('目    录', self.styles['h1']))
        self.story.append(Spacer(1, 10))
        items = [
            ('一、系统登录', '3'), ('二、首页看板', '4'), ('三、新建检测报告', '5'),
            ('四、保存与提交', '7'), ('五、记录列表', '8'), ('六、趋势分析', '9'),
            ('七、异常管理', '10'), ('八、采样点管理', '10'), ('九、人员管理', '11'),
            ('十、报告导出', '11'), ('十一、常见问题', '12'), ('十二、键盘快捷键', '13'),
            ('十三、数据备份', '13'),
        ]
        for title, page in items:
            dots = '.' * (50 - len(title))
            self.story.append(Paragraph(f'{title} {dots} {page}', self.styles['toc']))
        self.story.append(PageBreak())

    def add_table(self, lines):
        if len(lines) < 3:
            return
        header = [c.strip() for c in lines[0].split('|')[1:-1]]
        rows = []
        for line in lines[2:]:
            row = [c.strip() for c in line.split('|')[1:-1]]
            rows.append(row)

        data = [[Paragraph(self._format_text(c), self.styles['th']) for c in header]]
        for row in rows:
            data.append([Paragraph(self._format_text(c), self.styles['td']) for c in row])

        avail = WIDTH - 5*cm
        col_count = len(header)
        col_widths = [avail / col_count] * col_count

        t = Table(data, colWidths=col_widths, repeatRows=1)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HexColor('#f0f5fa')),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#d9d9d9')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor('#ffffff'), HexColor('#f8fafc')]),
        ]))
        self.story.append(Spacer(1, 6))
        self.story.append(t)
        self.story.append(Spacer(1, 6))

    def parse_md(self, md_text):
        lines = md_text.split('\n')
        i = 0
        while i < len(lines):
            line = lines[i]

            if line.startswith('# ') and i > 3:
                self.story.append(PageBreak())
                self.story.append(Paragraph(self._format_text(line[2:]), self.styles['h1']))
            elif line.startswith('## '):
                self.story.append(Paragraph(self._format_text(line[3:]), self.styles['h2']))
            elif line.startswith('### '):
                self.story.append(Paragraph(self._format_text(line[4:]), self.styles['h3']))
            elif line.startswith('|') and i+1 < len(lines) and lines[i+1].startswith('|'):
                table_lines = []
                while i < len(lines) and lines[i].startswith('|'):
                    table_lines.append(lines[i])
                    i += 1
                i -= 1
                if len(table_lines) >= 3:
                    self.add_table(table_lines)
            elif line.startswith('```'):
                code_lines = []
                i += 1
                while i < len(lines) and not lines[i].startswith('```'):
                    code_lines.append(lines[i])
                    i += 1
                for cl in code_lines:
                    self.story.append(Paragraph(cl.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'), self.styles['code']))
            elif line.startswith('---'):
                self.story.append(Spacer(1, 6))
            elif line.startswith('- ') or line.startswith('  - '):
                content = line.lstrip('- ').strip()
                self.story.append(Paragraph(f'• {self._format_text(content)}', self.styles['bullet']))
            elif line.startswith('> '):
                self.story.append(Paragraph(self._format_text(line[2:]), self.styles['code']))
            elif line.strip() == '':
                pass
            elif line.strip():
                self.story.append(Paragraph(self._format_text(line), self.styles['body']))
            i += 1

    def build(self, md_path):
        self.add_title_page()
        self.add_toc()

        md_text = open(md_path, encoding='utf-8').read()
        # Skip account info section (lines between ## 一 and ### 首次登录)
        lines = md_text.split('\n')
        filtered = []
        skip = False
        for line in lines:
            if line.startswith('## 一、系统登录'):
                skip = False
            if line == '### 账号信息':
                skip = True
                filtered.append('### 账号信息')
                filtered.append('')
                filtered.append('由管理员统一分配账号密码，首次登录后建议修改密码。')
                filtered.append('')
                continue
            if skip and line.startswith('###'):
                skip = False
            if skip:
                continue
            filtered.append(line)
        md_text = '\n'.join(filtered)
        self.parse_md(md_text)

        doc = SimpleDocTemplate(self.output, pagesize=A4,
                                leftMargin=2.5*cm, rightMargin=2.5*cm,
                                topMargin=2*cm, bottomMargin=2*cm,
                                title='水质管理系统用户操作手册',
                                author='美兰机场供水站')
        doc.build(self.story)
        size = os.path.getsize(self.output)
        print(f'PDF: {self.output} ({size/1024:.1f} KB)')


if __name__ == '__main__':
    PDFManual('D:/claude/水质管理系统/使用手册.pdf').build('D:/claude/水质管理系统/使用手册.md')
