"""部署后端代码 + 用户迁移到远端服务器"""
import paramiko, os, sys, time

HOST = '47.120.66.1'
USER = 'root'
PASSWORD = 'Kemengh1t'
APP_DIR = '/opt/water-quality'
BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backend')

def ssh_exec(client, cmd, desc=''):
    print(f'  {desc}...')
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if err:
        print(f'    ERR: {err[:200]}')
    return out

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f'Connecting to {HOST}...')
client.connect(HOST, username=USER, password=PASSWORD)
sftp = client.open_sftp()

# Step 1: Stop service
print('1. Stopping service...')
ssh_exec(client, 'systemctl stop water-quality.service', 'Stop')

# Step 2: Upload backend code
print('2. Uploading backend...')
for dirpath, dirnames, filenames in os.walk(os.path.join(BACKEND_DIR, 'app')):
    rel = os.path.relpath(dirpath, BACKEND_DIR)
    remote_dir = f'{APP_DIR}/backend/{rel}'.replace('\\', '/')
    # ensure remote dir
    try:
        sftp.stat(remote_dir)
    except FileNotFoundError:
        dir_parts = remote_dir.split('/')
        for i in range(2, len(dir_parts) + 1):
            try:
                sftp.stat('/'.join(dir_parts[:i]))
            except FileNotFoundError:
                sftp.mkdir('/'.join(dir_parts[:i]))
    for f in filenames:
        local_path = os.path.join(dirpath, f)
        remote_path = f'{remote_dir}/{f}'.replace('\\', '/')
        try:
            sftp.put(local_path, remote_path)
        except Exception as e:
            print(f'    WARN: {local_path} -> {remote_path}: {e}')

# Upload seed_data.py and requirements.txt
sftp.put(os.path.join(BACKEND_DIR, 'seed_data.py'), f'{APP_DIR}/backend/seed_data.py')
sftp.put(os.path.join(BACKEND_DIR, 'requirements.txt'), f'{APP_DIR}/backend/requirements.txt')
print('  Done')

# Step 3: Install Python dependencies
print('3. Installing Python dependencies...')
ssh_exec(client, f'{APP_DIR}/venv/bin/pip install -r {APP_DIR}/backend/requirements.txt -q', 'Pip')

# Step 4: Add new users
print('4. Adding new users to database...')
user_script = f'''
import sys
sys.path.insert(0, '{APP_DIR}/backend')
from app.database import SessionLocal
from app.models import User
import bcrypt

db = SessionLocal()
new_users = [
    ('zhengqingshan', '郑清山'), ('kemeng', '柯猛'), ('lizhenhui', '黎振辉'),
    ('xingzhouyu', '邢周玉'), ('wangheshan', '王和善'), ('chenying', '陈颖'),
    ('liuyi', '刘毅'), ('zhangwei', '张伟'), ('bairui', '白瑞'),
]
added = 0
for username, display_name in new_users:
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        print(f'  Skip: {{username}} (exists)')
        continue
    db.add(User(username=username, password_hash=bcrypt.hashpw('123456'.encode(), bcrypt.gensalt()).decode(), display_name=display_name, role='tester'))
    added += 1
    print(f'  Added: {{username}} ({{display_name}})')
db.commit()
print(f'  Total added: {{added}}')
db.close()
'''
ssh_exec(client, f'{APP_DIR}/venv/bin/python -c "{user_script}"', 'User migration')

# Step 5: Restart service
print('5. Restarting service...')
ssh_exec(client, 'systemctl restart water-quality.service', 'Restart')
time.sleep(3)
out = ssh_exec(client, 'systemctl status water-quality.service --no-pager | head -8', 'Status')
for line in out.split('\n'):
    print(f'    {line}')

# Verify
print()
print('6. Verifying...')
out = ssh_exec(client, f'curl -s -o /dev/null -w "%{{http_code}}" http://127.0.0.1:8000/api/records?page_size=1', 'API test')
print(f'    API response: {out.strip()}')

sftp.close()
client.close()
print()
print('Deployment complete!')
