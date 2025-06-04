#!/usr/bin/env python3
"""
Chrome扩展Popup测试服务器

用法:
    python start-test-server.py

然后在浏览器中打开: http://localhost:8080/test-popup.html
"""

import http.server
import socketserver
import webbrowser
import os
import threading
import time

class TestHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 添加CORS头部以避免跨域问题
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def log_message(self, format, *args):
        # 简化日志输出
        print(f"[{self.date_time_string()}] {format % args}")

def start_server():
    PORT = 8080
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    print(f"🚀 启动测试服务器...")
    print(f"📂 工作目录: {os.getcwd()}")
    print(f"🌐 服务器地址: http://localhost:{PORT}")
    print(f"🧪 测试页面: http://localhost:{PORT}/test-popup.html")
    print("=" * 50)
    
    with socketserver.TCPServer(("", PORT), TestHTTPRequestHandler) as httpd:
        print(f"✅ 服务器已启动在端口 {PORT}")
        
        # 延迟2秒后自动打开浏览器
        def open_browser():
            time.sleep(2)
            webbrowser.open(f'http://localhost:{PORT}/test-popup.html')
        
        threading.Thread(target=open_browser, daemon=True).start()
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 服务器已停止")
            httpd.shutdown()

if __name__ == "__main__":
    start_server() 