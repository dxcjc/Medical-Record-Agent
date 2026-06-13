# 任务：实现图片对照视图（ImageViewer）

## 背景
复核人员需要对比原图和识别结果，确认抽取是否正确。需要实现一个图片对照视图组件。

## 需要修改的文件
- `/tmp/Medical-Record-Agent/medical-ui/src/components/ImageViewer.tsx` - 新建图片对照组件
- `/tmp/Medical-Record-Agent/medical-ui/src/pages/JobDetailPage.tsx` - 集成图片对照组件

## 具体需求

### 1. ImageViewer 组件

**Props:**
```typescript
interface ImageViewerProps {
  imageUrl: string;           // 原图 URL
  highlightedField?: string;  // 高亮的字段 key
  onFieldClick?: (fieldKey: string) => void;  // 点击字段回调
  fields?: Array<{            // 字段列表（用于标注）
    key: string;
    label: string;
    value: string;
    coordinates?: {           // 字段在图片中的位置
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
}
```

**功能要求:**
1. **图片显示**
   - 支持缩放（滚轮缩放，双击适应）
   - 支持拖拽平移
   - 支持全屏模式
   - 显示缩放比例

2. **字段标注**
   - 在图片上显示字段标注框（如果有坐标信息）
   - 标注框颜色：蓝色（普通）、橙色（低置信度）、绿色（已确认）
   - 点击标注框高亮对应字段

3. **布局**
   - 左侧：原图（70% 宽度）
   - 右侧：字段列表（30% 宽度）
   - 支持拖拽调整左右比例

### 2. 集成到 JobDetailPage

在任务详情页的顶部添加图片对照视图：
- 使用 Arco Design 的 Drawer 或 Modal 组件
- 点击"查看原图"按钮打开
- 自动加载任务对应的原图

### 3. 样式要求

- 图片容器：灰色背景 (#F7F8FA)，带网格线
- 标注框：半透明背景，2px 边框
- 字段列表：Arco Design Descriptions 组件
- 响应式：移动端改为上下布局

### 4. API 接口

获取原图 URL：
```
GET /files/{fileId}/content
```

返回：图片二进制数据

### 5. 验证步骤

1. `cd /tmp/Medical-Record-Agent/medical-ui && pnpm build` 编译通过
2. 用已有任务测试图片加载
3. 测试缩放和拖拽功能
4. 测试字段标注显示

### 6. 输出审计报告

完成后输出审计报告：
- 修改了哪些文件
- 每项改动的具体内容
- 编译/测试结果
- 是否有遗漏
