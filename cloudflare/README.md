# Cloudflare Worker 代理部署说明

GitHub Pages 只能托管静态网页，不能运行 `server.js`。如果 API 服务不允许浏览器跨域请求，需要用 Cloudflare Worker 做一个轻量代理。

## 部署步骤

1. 注册并登录 Cloudflare。
2. 进入左侧 **Workers & Pages**。
3. 点击 **Create** / **创建**。
4. 选择 **Worker**。
5. 创建完成后点击 **Edit code**。
6. 删除默认代码，复制本目录的 `worker.js` 全部内容粘贴进去。
7. 点击 **Deploy**。
8. 复制 Worker 地址，通常类似：

   ```text
   https://你的-worker.你的用户名.workers.dev
   ```

9. 回到本项目 `public/app.js`，把：

   ```js
   const DEFAULT_PROXY_BASE_URL = '';
   ```

   改成你的 Worker 地址，例如：

   ```js
   const DEFAULT_PROXY_BASE_URL = 'https://你的-worker.你的用户名.workers.dev';
   ```

10. 提交并推送到 GitHub，等 GitHub Pages 自动部署完成。

## 安全说明

当前 Worker 只允许转发这两个接口：

- `/models`
- `/chat/completions`

并且只转发到：

```text
https://aiapi.setbug.cn/v1
```

它不会保存 API Key。API Key 只会从访问者浏览器请求头转发到上游 API。
