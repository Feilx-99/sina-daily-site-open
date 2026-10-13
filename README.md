# 物业日报（公开版）

启皓、五栋项目的物业日报：部门填报、管理员审核发布、甲方查看，以及周报、月报和区间统计。数据存在 Netlify Blobs；本地没有 Netlify 环境时，会落到已忽略的 `.local-blobs/`。

这个仓库是去掉真实运营数据后的公开版本。里面没有历史工作簿、没有可穷举的默认访问码，也没有线上项目 ID。

## 环境要求

- Node.js `>= 22.13.0`
- npm

## 本地运行

```bash
npm ci
cp .env.example .env.local
```

编辑 `.env.local`：为下面每个变量填入互不相同的 6 位数字。这些值只存在于你的环境里，不要提交。

- `ACCESS_CODE_ADMIN`：管理员
- `ACCESS_CODE_CLIENT`：甲方查看
- `ACCESS_CODE_QH_CUSTOMER`：启皓客服
- `ACCESS_CODE_QH_ENGINEERING`：启皓工程
- `ACCESS_CODE_QH_CLEANING`：启皓保洁
- `ACCESS_CODE_QH_SECURITY`：启皓安保
- `ACCESS_CODE_WD_SERVICE`：五栋

`LOCAL_TEST_MODE=true` 时，登录 Cookie 不带 `Secure`，这样用 `http://localhost` 也能保持登录。只在本地 HTTP 开发时使用。部署到 Netlify 或任何 HTTPS 环境时不要设置它，否则会话 Cookie 可以在非加密连接上发送。

```bash
npm run dev
```

浏览器打开命令行里打印的地址（默认 `http://localhost:3000`），用你自己设置的访问码登录。

Next.js 会自动读取 `.env.local`。如果某个 `ACCESS_CODE_*` 留空，首次创建存储时会为该角色随机生成 6 位数字，写入 `.local-access-codes.json`（已被 git 忽略），并在进程日志里打印一次。生产环境请在第一次访问之前设好全部变量，避免访问码出现在日志里。

访问码只在存储里还没有 `state` 时生效。之后再改环境变量不会替换已经保存的码。管理员登录后可以在界面里更换。若要整站重新初始化，删除 Blobs 里的 `state`（本地则删除 `.local-blobs/`）。这会清掉全部日报和会话。

## 示例数据

默认不导入任何日报。需要一条虚构示例时，在首次启动前设置：

```bash
DEMO_SEED=true
```

示例只有 2026-01-06 的一条客服日报和一条跟进事项，填报人是「演示填报人」。已经初始化过的存储不会补写这条数据。

## 部署到 Netlify

`netlify.toml` 已指定：

- 构建命令：`npm run build`
- 发布目录：`.next`
- Node.js：`22`

Netlify 会识别 Next.js 并使用自带的 Next 运行时，不需要再装适配器。日报正文存在名为 `property-daily-data` 的 Netlify Blobs 里。

1. 用本仓库新建一个 Netlify 站点（Git 关联，或在本机执行 `npx netlify login` 后 `npx netlify deploy --build`）。
2. 在 Site configuration → Environment variables 里，于**第一次访问之前**设置全部 `ACCESS_CODE_*`。生产环境不要设置 `LOCAL_TEST_MODE`。
3. 需要虚构示例日报时，同样在首次访问前设置 `DEMO_SEED=true`。初始化完成后可以去掉这个变量。
4. 部署。预览用 `npx netlify deploy --build`，生产用 `npx netlify deploy --build --prod`。

Blobs 在 Netlify 函数环境中自动可用。不要把 `NETLIFY_AUTH_TOKEN` 或站点数据提交到仓库。

## 不要提交

- `.env`、`.env.local` 以及任何真实访问码
- `.local-access-codes.json`
- `.local-blobs/`（本地日报和照片）
- `.netlify/`、生产备份、导出的工作簿

## 常用命令

- `npm run dev`：本地开发
- `npm run build`：生产构建
- `npm run start`：运行构建结果
- `npm run lint`：检查代码
