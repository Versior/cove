import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CardStyle, Density, LinkItem } from '../types';
import { gridClassFor } from '../services/density';
import LinkCard, { type CardServiceStatus } from './LinkCard';
interface SortableCardProps {
  link: LinkItem;
  cardStyle: CardStyle;
  /** 全局密度，透传给卡片以控制图标与字号。 */
  density?: Density;
  /** 整理模式：显示勾选框并禁用跳转。 */
  selectable?: boolean;
  selected?: boolean;
  /** 显示拖拽把手（仅手动排序且非整理模式）。 */
  draggable?: boolean;
  /** dnd-kit 的 activator ref，挂到把手上。 */
  activatorRef?: (node: HTMLElement | null) => void;
  onOpen: (link: LinkItem) => void;
  onEdit: (link: LinkItem) => void;
  onToggleSelect?: (id: string) => void;
  onContextMenu?: (event: React.MouseEvent, link: LinkItem) => void;
  serviceStatus?: CardServiceStatus;
}

/**
 * 单个可拖拽卡片。
 * 拖拽监听挂在外层；同时把 activatorRef 传给卡片内的把手，
 * 这样按住把手也能拖动（否则把手只是装饰，点它没有反应）。
 */
const SortableCard: React.FC<SortableCardProps> = props => {
  const sortable = useSortable({ id: props.link.id, disabled: !props.draggable });

  /*
   * 监听挂哪里，取决于卡片形态：
   *
   * 图标视图没有把手（把手下压会盖住图标），因此整张卡就是拖拽区，
   * 监听必须挂在外层 —— 靠 PointerSensor 的 8px 位移阈值区分"单击打开"和"拖动"。
   *
   * 其它视图有把手，监听挂在把手上，这样卡片本身的右键菜单不会被 dnd-kit 吞掉。
   */
  const isIcon = props.cardStyle === 'icon';
  const useOuterListeners = props.draggable && isIcon;

  return (
    <div
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className={sortable.isDragging ? 'z-10 opacity-60' : undefined}
      {...(useOuterListeners ? sortable.attributes : {})}
      {...(useOuterListeners ? sortable.listeners : {})}
    >
      <LinkCard
        {...props}
        activatorRef={props.draggable && !isIcon ? sortable.setActivatorNodeRef : undefined}
      />
    </div>
  );
};

interface BookmarkGridProps extends Omit<SortableCardProps, 'link' | 'selected' | 'serviceStatus'> {
  /** 开启在线状态监测的书签 → 最近一次结果；还没结果的显示为检测中。 */
  statusMap?: Record<string, CardServiceStatus>;
  links: LinkItem[];
  /** 整理模式下按 id 判断选中，避免逐卡传布尔值。 */
  selectedIds?: Set<string>;
  /** 全局密度，决定列数与卡片尺寸。 */
  density?: Density;
}

/** 网格容器：列数与间距由密度决定，列表模式降为单列。 */
const BookmarkGrid: React.FC<BookmarkGridProps> = ({ links, cardStyle, selectedIds, density = 'cozy', statusMap, ...rest }) => {
  const gridClass = gridClassFor(density, cardStyle);

  return (
    <div className={gridClass}>
      {links.map(link => (
        <SortableCard
          key={link.id}
          link={link}
          cardStyle={cardStyle}
          density={density}
          selected={selectedIds?.has(link.id) ?? false}
          serviceStatus={link.monitor ? statusMap?.[link.id] ?? 'checking' : undefined}
          {...rest}
        />
      ))}
    </div>
  );
};

export default React.memo(BookmarkGrid);
