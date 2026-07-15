# slides +media-upload（上传本地图片到飞书幻灯片）

把本地图片上传到指定演示文稿的 drive 媒体库，返回 `file_token`。**返回的 token 作为 `<img src="...">` 的值塞进 slide XML 即可显示图片。**

## 用法

```
# 直接传 xml_presentation_id
lark_slides_media_upload(file="./pic.png", presentation="slidesXXXXXXXXXXXXXXXXXXXXXX")

# 传 slides URL 也行
lark_slides_media_upload(file="./chart.png", presentation="https://xxx.feishu.cn/slides/slidesXXXXXXXXXXXXXXXXXXXXXX")

# 传 wiki URL（自动解析为真实 token，校验 obj_type=slides）
lark_slides_media_upload(file="./pic.png", presentation="https://xxx.feishu.cn/wiki/wikcnXXXXXX")
```

## 返回值

```json
{
  "file_token": "boxcnXXXXXXXXXXXXXXXXXXXXXX",
  "file_name": "pic.png",
  "size": 12345,
  "presentation_id": "slidesXXXXXXXXXXXXXXXXXXXXXX"
}
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `file` | 是 | 本地图片路径，**必须是 CWD 内的相对路径**（如 `./pic.png`）。**最大 20 MB** |
| `presentation` | 是 | `xml_presentation_id`、`/slides/<token>` URL，或 `/wiki/<token>` URL |

## 常见错误

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| 1061002 | params error / 不支持的 parent_type | 使用 `lark_slides_media_upload`，不要自己拼原生 API |
| 1061004 | forbidden：当前身份对该演示文稿无编辑权限 | 确认当前身份对目标 PPT 有编辑权限 |
| 1061044 | parent node not exist | `presentation` 给的 token 不对，或不是 slides 类型 |
| 403 | 权限不足 | 检查 `docs:document.media:upload` scope |

## 参考

- `lark_get_skill(domain="slides", section="create")` — 新建 PPT（支持 `@` 占位符自动上传图片）
- `lark_get_skill(domain="slides", section="replace-slide")` — 给已有页加图 / 换图
