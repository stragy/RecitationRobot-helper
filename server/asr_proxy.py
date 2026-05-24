#!/usr/bin/env python3
"""
腾讯云语音识别代理服务器 (Python 版)
简化版，无需 npm install
"""

import http.server
import socketserver
import json
import hashlib
import hmac
import datetime
import time
import os
import urllib.request
import ssl

# 腾讯云配置（从环境变量读取）
TENCENT_CONFIG = {
    'secret_id': os.environ.get('TENCENT_SECRET_ID', ''),
    'secret_key': os.environ.get('TENCENT_SECRET_KEY', ''),
    'region': 'ap-guangzhou',
    'host': 'asr.tencentcloudapi.com',
    'service': 'asr',
    'version': '2019-06-14'
}

def sign(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

def get_signature_key(key, date_stamp, region_name, service_name):
    k_date = sign(('TC3' + key).encode('utf-8'), date_stamp)
    k_region = sign(k_date, region_name)
    k_service = sign(k_region, service_name)
    k_signing = sign(k_service, 'tc3_request')
    return k_signing

def generate_signature(payload, timestamp, date):
    """生成腾讯云 API 签名"""
    http_request_method = 'POST'
    canonical_uri = '/'
    canonical_querystring = ''
    canonical_headers = f'content-type:application/json\nhost:{TENCENT_CONFIG["host"]}\n'
    signed_headers = 'content-type;host'
    hashed_request_payload = hashlib.sha256(payload.encode('utf-8')).hexdigest()
    canonical_request = f'{http_request_method}\n{canonical_uri}\n{canonical_querystring}\n{canonical_headers}\n{signed_headers}\n{hashed_request_payload}'

    algorithm = 'TC3-HMAC-SHA256'
    credential_scope = f'{date}/{TENCENT_CONFIG["service"]}/tc3_request'
    hashed_canonical_request = hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()
    string_to_sign = f'{algorithm}\n{timestamp}\n{credential_scope}\n{hashed_canonical_request}'

    secret_key = get_signature_key(TENCENT_CONFIG['secret_key'], date, TENCENT_CONFIG['region'], TENCENT_CONFIG['service'])
    signature = hmac.new(secret_key, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()

    authorization = f'{algorithm} Credential={TENCENT_CONFIG["secret_id"]}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}'
    return authorization

class ASRHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """处理 CORS 预检请求"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        """处理 POST 请求"""
        if self.path == '/api/v1/asr/sentence':
            try:
                # 读取请求体
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                body = json.loads(post_data.decode('utf-8'))

                audio_base64 = body.get('audioBase64', '')
                audio_format = body.get('audioFormat', 'wav')
                language = body.get('language', 'zh')

                if not audio_base64:
                    self._send_json_response(400, {'success': False, 'error': '缺少音频数据'})
                    return

                # 构建腾讯云请求体
                payload = json.dumps({
                    'ProjectId': 0,
                    'SubServiceType': 2,
                    'EngSerViceType': '16k_en' if language == 'en' else '16k_zh',
                    'SourceType': 1,
                    'VoiceFormat': audio_format,
                    'Data': audio_base64,
                    'DataLen': len(audio_base64) * 3 // 4  # base64 解码后的长度
                })

                # 使用 UTC 时间戳（腾讯云要求）
                # 使用 time.time() 获取精确的 Unix 时间戳（UTC）
                timestamp = str(int(time.time()))
                date = datetime.datetime.utcnow().strftime('%Y-%m-%d')
                authorization = generate_signature(payload, timestamp, date)

                # 发送请求到腾讯云
                headers = {
                    'Content-Type': 'application/json',
                    'Host': TENCENT_CONFIG['host'],
                    'X-TC-Action': 'SentenceRecognition',
                    'X-TC-Version': TENCENT_CONFIG['version'],
                    'X-TC-Timestamp': timestamp,
                    'X-TC-Region': TENCENT_CONFIG['region'],
                    'Authorization': authorization
                }

                req = urllib.request.Request(
                    f'https://{TENCENT_CONFIG["host"]}',
                    data=payload.encode('utf-8'),
                    headers=headers,
                    method='POST'
                )

                # 忽略 SSL 验证（开发环境）
                context = ssl.create_default_context()
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE

                with urllib.request.urlopen(req, context=context, timeout=10) as response:
                    result = json.loads(response.read().decode('utf-8'))

                if 'Response' in result and 'Result' in result['Response']:
                    self._send_json_response(200, {
                        'success': True,
                        'text': result['Response']['Result'],
                        'confidence': result['Response'].get('Confidence', 0)
                    })
                elif 'Response' in result and 'Error' in result['Response']:
                    self._send_json_response(500, {
                        'success': False,
                        'error': result['Response']['Error'].get('Message', '识别失败'),
                        'code': result['Response']['Error'].get('Code', '')
                    })
                else:
                    self._send_json_response(500, {'success': False, 'error': '识别失败'})

            except Exception as e:
                print(f'错误: {e}')
                self._send_json_response(500, {'success': False, 'error': f'服务器错误: {str(e)}'})
        else:
            self._send_json_response(404, {'success': False, 'error': '路径不存在'})

    def _send_json_response(self, status_code, data):
        """发送 JSON 响应"""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def log_message(self, format, *args):
        """自定义日志"""
        print(f"[{datetime.datetime.now()}] {args[0]}")

if __name__ == '__main__':
    PORT = 3000
    with socketserver.TCPServer(("", PORT), ASRHandler) as httpd:
        print(f"腾讯云 ASR 代理服务器启动在 http://localhost:{PORT}")
        print(f"API 地址: http://localhost:{PORT}/api/v1/asr/sentence")
        httpd.serve_forever()
