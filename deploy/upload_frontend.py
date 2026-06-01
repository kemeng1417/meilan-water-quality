"""Upload frontend build to server"""
import paramiko, os, time

HOST = '47.120.66.1'
USER = 'root'
PASSWORD = 'Kemengh1t'
APP_DIR = '/opt/water-quality'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f'Connecting to {HOST}...')
client.connect(HOST, username=USER, password=PASSWORD)

sftp = client.open_sftp()

script_dir = os.path.dirname(__file__)
project_dir = os.path.dirname(script_dir)
local_dist = os.path.join(project_dir, 'frontend', 'dist')

print('Uploading frontend build...')
count = 0
for dirpath, dirnames, filenames in os.walk(local_dist):
    rel = os.path.relpath(dirpath, local_dist)
    if rel == '.':
        remote_dir = f'{APP_DIR}/frontend/dist'
    else:
        rel_fixed = rel.replace('\\', '/')
        remote_dir = f'{APP_DIR}/frontend/dist/{rel_fixed}'

    # ensure remote dir
    parts = remote_dir.split('/')
    for i in range(3, len(parts) + 1):
        d = '/'.join(parts[:i])
        try:
            sftp.stat(d)
        except FileNotFoundError:
            try:
                sftp.mkdir(d)
            except Exception:
                pass

    for f in filenames:
        local_path = os.path.join(dirpath, f).replace('\\', '/')
        remote_path = remote_dir + '/' + f
        try:
            sftp.put(local_path, remote_path)
            count += 1
        except Exception as e:
            print(f'  Error uploading {f}: {e}')

print(f'  Uploaded {count} files')

# Restart service
print('Restarting service...')
stdin, stdout, stderr = client.exec_command('systemctl restart water-quality.service')
time.sleep(3)
stdin, stdout, stderr = client.exec_command('systemctl status water-quality.service --no-pager | head -5')
out = stdout.read().decode()
for line in out.split('\n'):
    print(f'  {line}')

# Verify
stdin, stdout, stderr = client.exec_command('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/')
code = stdout.read().decode().strip()
print(f'HTTP status: {code}')

sftp.close()
client.close()
print('Done!')
