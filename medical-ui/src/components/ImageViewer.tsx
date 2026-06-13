import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Drawer,
  Button,
  Tag,
  Space,
  Descriptions,
  Tooltip,
  Typography,
} from '@arco-design/web-react';
import {
  IconEye,
  IconRefresh,
} from '../icons/appIcons';

const { Text } = Typography;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FieldAnnotation {
  key: string;
  label: string;
  value: string;
  coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence?: number;
  confirmed?: boolean;
}

export interface ImageViewerProps {
  imageUrl: string;
  highlightedField?: string;
  onFieldClick?: (fieldKey: string) => void;
  fields?: FieldAnnotation[];
  visible: boolean;
  onClose: () => void;
  title?: string;
}

/* ------------------------------------------------------------------ */
/*  Annotation box color based on state                                */
/* ------------------------------------------------------------------ */

function annotationColor(field: FieldAnnotation, isHighlighted: boolean): {
  border: string;
  bg: string;
  label: string;
} {
  if (field.confirmed) {
    return {
      border: '#00B42A',
      bg: 'rgba(0, 180, 42, 0.15)',
      label: '#00B42A',
    };
  }
  if (field.confidence != null && field.confidence < 0.6) {
    return {
      border: '#FF7D00',
      bg: 'rgba(255, 125, 0, 0.15)',
      label: '#FF7D00',
    };
  }
  return {
    border: isHighlighted ? '#3370FF' : '#3370FF',
    bg: isHighlighted ? 'rgba(51, 112, 255, 0.25)' : 'rgba(51, 112, 255, 0.12)',
    label: '#3370FF',
  };
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ImageViewer({
  imageUrl,
  highlightedField,
  onFieldClick,
  fields = [],
  visible,
  onClose,
  title = '原图对照',
}: ImageViewerProps) {
  /* Zoom / pan state */
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeField, setActiveField] = useState<string | undefined>(highlightedField);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const touchRef = useRef<{
    lastDist: number;
    lastCenter: { x: number; y: number };
    isDragging: boolean;
    dragStart: { x: number; y: number };
    translateStart: { x: number; y: number };
  }>({ lastDist: 0, lastCenter: { x: 0, y: 0 }, isDragging: false, dragStart: { x: 0, y: 0 }, translateStart: { x: 0, y: 0 } });

  /* Sync external highlight */
  useEffect(() => {
    setActiveField(highlightedField);
  }, [highlightedField]);

  /* Reset when opening */
  useEffect(() => {
    if (visible) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
      setImageLoaded(false);
      setImageError(false);
    }
  }, [visible]);

  /* ---- Zoom ---- */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => {
      const next = Math.min(Math.max(prev + delta, 0.2), 5);
      return Math.round(next * 100) / 100;
    });
  }, []);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 5));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.2));
  const handleResetZoom = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };
  const handleFitWidth = () => {
    if (!containerRef.current || !imageNaturalSize.w) return;
    const containerWidth = containerRef.current.clientWidth - 32; // padding
    const fitScale = containerWidth / imageNaturalSize.w;
    setScale(Math.round(fitScale * 100) / 100);
    setTranslate({ x: 0, y: 0 });
  };

  /* ---- Drag ---- */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // left click only
      setIsDragging(true);
      setDragStart({ x: e.clientX - translate.x, y: e.clientY - translate.y });
    },
    [translate],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setTranslate({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);
  /* ---- Touch: pinch-to-zoom + single-finger drag ---- */
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch start
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchRef.current.lastDist = Math.hypot(dx, dy);
        touchRef.current.lastCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
        touchRef.current.isDragging = false;
      } else if (e.touches.length === 1) {
        // Single-finger drag start
        touchRef.current.isDragging = true;
        touchRef.current.dragStart = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        setTranslate((prev) => {
          touchRef.current.translateStart = { ...prev };
          return prev;
        });
      }
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);

        if (touchRef.current.lastDist > 0) {
          const scaleDelta = dist / touchRef.current.lastDist;
          setScale((prev) => Math.min(Math.max(prev * scaleDelta, 0.2), 5));
        }
        touchRef.current.lastDist = dist;

        // Pan with two fingers
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        if (touchRef.current.lastCenter.x !== 0 || touchRef.current.lastCenter.y !== 0) {
          const dpx = cx - touchRef.current.lastCenter.x;
          const dpy = cy - touchRef.current.lastCenter.y;
          setTranslate((prev) => ({ x: prev.x + dpx, y: prev.y + dpy }));
        }
        touchRef.current.lastCenter = { x: cx, y: cy };
      } else if (e.touches.length === 1 && touchRef.current.isDragging) {
        // Single-finger drag
        const dpx = e.touches[0].clientX - touchRef.current.dragStart.x;
        const dpy = e.touches[0].clientY - touchRef.current.dragStart.y;
        setTranslate({
          x: touchRef.current.translateStart.x + dpx,
          y: touchRef.current.translateStart.y + dpy,
        });
      }
    },
    [],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
        touchRef.current.lastDist = 0;
        touchRef.current.lastCenter = { x: 0, y: 0 };
      }
      if (e.touches.length === 0) {
        touchRef.current.isDragging = false;
      }
    },
    [],
  );

  /* ---- Double-click to reset ---- */
  const handleDoubleClick = useCallback(() => {
    handleFitWidth();
  }, [imageNaturalSize]);

  /* ---- Image load handlers ---- */
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    setImageLoaded(true);
    setImageError(false);
  };

  const onImageError = () => {
    setImageError(true);
    setImageLoaded(false);
  };

  /* ---- Field click ---- */
  const handleFieldItemClick = (key: string) => {
    setActiveField(key);
    onFieldClick?.(key);

    // Scroll to annotation if coordinates exist
    const field = fields.find((f) => f.key === key);
    if (field?.coordinates && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const cx = field.coordinates.x + field.coordinates.width / 2;
      const cy = field.coordinates.y + field.coordinates.height / 2;
      // Center the annotation in the container
      setTranslate({
        x: containerRect.width / 2 - cx * scale,
        y: containerRect.height / 2 - cy * scale,
      });
    }
  };

  /* ---- Build image URL with auth token ---- */
  const getImageSrc = (url: string) => {
    // The URL is already a relative path like /api/files/{id}/content
    // We don't need to modify it, the browser will include cookies
    return url;
  };

  /* ---- Render ---- */
  return (
    <Drawer
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <IconEye style={{ color: '#3370FF', fontSize: 16 }} />
          {title}
        </span>
      }
      visible={visible}
      onCancel={onClose}
      width="90vw"
      style={{ maxWidth: 1600 }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {imageNaturalSize.w > 0 &&
              `原始尺寸: ${imageNaturalSize.w} × ${imageNaturalSize.h}`}
          </Text>
          <Space>
            <Button size="small" onClick={handleZoomOut}>缩小</Button>
            <Tag
              style={{
                minWidth: 60,
                textAlign: 'center',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {(scale * 100).toFixed(0)}%
            </Tag>
            <Button size="small" onClick={handleZoomIn}>放大</Button>
            <Button size="small" onClick={handleResetZoom}>100%</Button>
            <Button size="small" onClick={handleFitWidth}>适应宽度</Button>
          </Space>
        </div>
      }
    >
      <div
        style={{
          display: 'flex',
          height: 'calc(100vh - 160px)',
          gap: 0,
        }}
      >
        {/* ---- Left: Image area (70%) ---- */}
        <div
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            flex: '7 1 0',
            minWidth: 0,
            background: '#F7F8FA',
            backgroundImage: `
              linear-gradient(45deg, #ECEEF1 25%, transparent 25%),
              linear-gradient(-45deg, #ECEEF1 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #ECEEF1 75%),
              linear-gradient(-45deg, transparent 75%, #ECEEF1 75%)
            `,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
            borderRadius: 8,
            overflow: 'hidden',
            position: 'relative',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            touchAction: 'none',
          }}
        >
          {/* Loading state */}
          {!imageLoaded && !imageError && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5,
              }}
            >
              <Text type="secondary">加载图片中...</Text>
            </div>
          )}

          {/* Error state */}
          {imageError && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                zIndex: 5,
              }}
            >
              <Text type="secondary">图片加载失败</Text>
              <Button
                size="small"
                icon={<IconRefresh />}
                onClick={() => {
                  setImageError(false);
                  setImageLoaded(false);
                  // Force reload by appending timestamp
                  if (imgRef.current) {
                    const src = imgRef.current.src.split('?')[0];
                    imgRef.current.src = `${src}?t=${Date.now()}`;
                  }
                }}
              >
                重试
              </Button>
            </div>
          )}

          {/* Image + annotations */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img
                ref={imgRef}
                src={getImageSrc(imageUrl)}
                alt="原图"
                onLoad={onImageLoad}
                onError={onImageError}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  display: imageLoaded ? 'block' : 'none',
                  pointerEvents: 'none',
                }}
                crossOrigin="use-credentials"
                draggable={false}
              />

              {/* Annotation overlays */}
              {imageLoaded &&
                fields.map((field) => {
                  if (!field.coordinates) return null;
                  const { x, y, width, height } = field.coordinates;
                  const isActive = activeField === field.key;
                  const colors = annotationColor(field, isActive);

                  return (
                    <Tooltip
                      key={field.key}
                      content={
                        <div style={{ maxWidth: 240 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>
                            {field.label}
                          </div>
                          <div>{field.value}</div>
                          {field.confidence != null && (
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                              置信度: {(field.confidence * 100).toFixed(0)}%
                            </div>
                          )}
                        </div>
                      }
                    >
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFieldItemClick(field.key);
                        }}
                        style={{
                          position: 'absolute',
                          left: x,
                          top: y,
                          width,
                          height,
                          border: `2px solid ${colors.border}`,
                          background: colors.bg,
                          borderRadius: 2,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          zIndex: isActive ? 10 : 1,
                          boxShadow: isActive
                            ? `0 0 0 2px ${colors.border}, 0 2px 8px rgba(0,0,0,0.2)`
                            : 'none',
                        }}
                      >
                        {/* Label tag */}
                        <div
                          style={{
                            position: 'absolute',
                            top: -20,
                            left: -1,
                            background: colors.border,
                            color: '#fff',
                            fontSize: 11,
                            padding: '1px 6px',
                            borderRadius: '3px 3px 0 0',
                            whiteSpace: 'nowrap',
                            fontWeight: 500,
                          }}
                        >
                          {field.label}
                        </div>
                      </div>
                    </Tooltip>
                  );
                })}
            </div>
          </div>

          {/* Zoom indicator overlay */}
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              background: 'rgba(0,0,0,0.5)',
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              pointerEvents: 'none',
            }}
          >
            {(scale * 100).toFixed(0)}%
          </div>
        </div>

        {/* ---- Right: Field list (30%) ---- */}
        <div
          style={{
            flex: '3 1 0',
            minWidth: 240,
            maxWidth: 400,
            paddingLeft: 16,
            overflowY: 'auto',
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 15, fontWeight: 600 }}>识别字段</Text>
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
              共 {fields.length} 项
            </Text>
          </div>

          {fields.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
              暂无字段数据
            </div>
          ) : (
            <Descriptions
              column={1}
              data={fields.map((field) => {
                const isActive = activeField === field.key;
                const colors = annotationColor(field, isActive);

                return {
                  label: (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: colors.border,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontWeight: isActive ? 600 : 400,
                          color: isActive ? colors.border : undefined,
                        }}
                      >
                        {field.label}
                      </span>
                    </div>
                  ),
                  value: (
                    <div
                      onClick={() => handleFieldItemClick(field.key)}
                      style={{
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: 4,
                        background: isActive ? `${colors.border}10` : 'transparent',
                        border: isActive
                          ? `1px solid ${colors.border}40`
                          : '1px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize: 13, marginBottom: 2 }}>
                        {field.value || '-'}
                      </div>
                      {field.confidence != null && (
                        <Tag
                          size="small"
                          color={
                            field.confirmed
                              ? 'green'
                              : field.confidence >= 0.8
                              ? 'green'
                              : field.confidence >= 0.5
                              ? 'orange'
                              : 'red'
                          }
                        >
                          {field.confirmed
                            ? '已确认'
                            : `${(field.confidence * 100).toFixed(0)}%`}
                        </Tag>
                      )}
                      {field.coordinates && (
                        <Tag size="small" style={{ marginLeft: 4 }}>
                          有标注
                        </Tag>
                      )}
                    </div>
                  ),
                };
              })}
            />
          )}
        </div>
      </div>
    </Drawer>
  );
}
