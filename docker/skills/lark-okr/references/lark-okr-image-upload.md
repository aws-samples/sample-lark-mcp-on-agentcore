# lark_okr_upload_image

上传本地图片，用于 OKR 进展记录的富文本内容。

## 用法

```
# 上传图片用于目标的进展记录
lark_okr_upload_image(file="./progress_screenshot.png", target_id="1234567890123456789", target_type="objective")

# 上传图片用于关键结果的进展记录
lark_okr_upload_image(file="./chart.jpg", target_id="9876543210987654321", target_type="key_result")
```

## 参数

| 参数              | 必填 | 默认值 | 说明                                    |
|-----------------|----|-----|---------------------------------------|
| `file`        | 是  | —   | 本地图片路径。**必须使用相对路径**（如 `./photo.png`）。 |
| `target_id`   | 是  | —   | 目标 ID 或关键结果 ID（int64 类型，正整数）          |
| `target_type` | 是  | —   | 目标类型：`objective` \| `key_result`      |

## 工作流程

1. 使用 `lark_okr_cycle_list` 和 `lark_okr_cycle_detail` 获取目标或关键结果的 ID。
2. 准备本地图片文件，确保格式受支持。
3. 执行 `lark_okr_upload_image(file="./image.png", target_id="...", target_type="objective")`。
4. 获取返回的 `file_token`，用于构建 ContentBlock 中的图片内容。

## 输出

返回 JSON：

```json
{
  "file_token": "example-file-token",
  "url": "https://example.larksuite.com/download?file_token=example-file-token",
  "file_name": "screenshot.png",
  "size": 102400
}
```

其中：

- `file_token` — 用于在 ContentBlock 的 `ContentGallery` 中引用图片
- `url` — 图片的访问 URL
- `file_name` — 上传的文件名
- `size` — 文件大小（字节）

## 在进展记录中使用上传的图片

上传图片后，将返回的 `file_token` 用于构建 ContentBlock 的图库块：

```json
{
  "blocks": [
    {
      "block_element_type": "paragraph",
      "paragraph": {
        "elements": [
          {
            "paragraph_element_type": "textRun",
            "text_run": {
              "text": "本周进展截图："
            }
          }
        ]
      }
    },
    {
      "block_element_type": "gallery",
      "gallery": {
        "images": [
          {
            "file_token": "example-file-token",
            "width": 800,
            "height": 600
          }
        ]
      }
    }
  ]
}
```

然后在创建或更新进展记录时使用此 ContentBlock：

```
lark_okr_progress_create(content="<ContentBlock JSON>", target_id="1234567890123456789", target_type="objective")
```

## 安全限制

- `file` 参数**必须使用相对路径**（如 `./photo.png` 或 `images/photo.png`），不支持绝对路径
- 图片文件必须存在于当前工作目录或其子目录中
- 不支持符号链接指向目录外的文件

## 参考

- `lark_get_skill(domain="okr")` -- 所有 OKR 工具(shortcut 和 API 接口)
- `lark_get_skill(domain="okr", section="contentblock")` -- 进展内容使用的富文本格式，包含图片块的使用说明
- `lark_get_skill(domain="okr", section="progress-create")` -- 创建进展记录
- `lark_get_skill(domain="okr", section="progress-update")` -- 更新进展记录
