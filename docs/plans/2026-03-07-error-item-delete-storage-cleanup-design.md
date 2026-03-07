# Error Item Delete Storage Cleanup Design

## Goal

让错题详情页的“删除题目”在删除数据库记录前，先严格清理 Supabase Storage 中对应的图片对象，避免留下新的孤儿文件。

## Chosen Behavior

- 删除接口先收集这道题可能关联的 storage key：
  - `cropImageKey`
  - `rawImageKey`
  - `originalImageUrl` 中可解析出的 `storage:` key
- key 去重后，先调用 Supabase Storage 删除。
- 如果图片对象本来就不存在，视为“已清理”，继续删数据库。
- 如果出现真正的 Storage 错误，例如网络、权限、bucket 或服务异常，则整次删题失败，数据库记录保持不删。

## Why This Approach

- 先删 Storage、后删数据库，才能满足你确认的“严格模式”。
- 去重后批量删除可以避免同一张图被重复删。
- 把“对象已不存在”当成成功，可以兼容历史脏数据或手工清理过的文件。

## Scope

- 修改 Supabase Storage helper，新增删除私有对象能力。
- 修改 `DELETE /api/error-items/[id]/delete`。
- 增加接口级回归测试，覆盖成功删除、无 key、重复 key、Storage 失败中止几种情况。
