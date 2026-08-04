
# drive +download

从飞书云空间（云盘/云存储）下载文件到本地。

## 命令

```
# 下载到指定路径
lark_drive_download(file_token="boxbc_xxx", output="./report.pdf")

# 只提供 token，默认保存到当前目录
lark_drive_download(file_token="boxbc_xxx")
```

## URL 解析

从飞书文件 URL 提取 token：

```
https://xxx.feishu.cn/drive/file/boxbc_xxx
                                  ^^^^^^^^^
                                  file_token
```

## 排障

- 如果返回 `HTTP 403`，可以使用 `lark_get_skill(domain="drive", section="preview")` 里的 `lark_drive_preview` 下载源文件产物。

## 参考

- `lark_get_skill(domain="drive")` -- 云空间（云盘/云存储）全部命令
