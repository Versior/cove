import React from 'react';
import {
  AlertCircle, Archive, AtSign, Bike, Bell, Book, BookOpen, Bookmark, Bot, Calendar, Camera, Car, Check,
  ChevronDown, ChevronUp, Chrome, Circle, Clock, Cloud, CloudRain, CloudSnow, Code, Columns, Copy, CreditCard,
  Database, Download, Edit, ExternalLink, File, FileText, Filter, Flag, Folder, Gamepad2, Github, Gitlab, Grid,
  Hash, Headphones, Heart, Hexagon, Highlighter, Home, Image, Info, Layers, Layout, Link, List, Lock, Mail, MapPin,
  Menu, MessageCircle, MessageSquare, Mic, Minus, Moon, MoreVertical, Music, Newspaper, Package, Palette, Pause,
  PenTool, Percent, Phone, Plane, Play, Plus, Rocket, Search, Send, Server, Settings, Share, Ship, ShoppingCart,
  Sidebar, Square, Star, Store, Sun, Tag, Target, Terminal, Thermometer, Train, Trash2, Triangle, Truck, Type,
  Upload, User, Users, Volume2, Wifi, Wind, Wrench, X, Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * 常用图标静态打包；其余图标名首次出现时才整体懒加载 lucide。
 * 直接 `import * as LucideIcons` 会把 1600 多个图标全部塞进首屏主包。
 */
const COMMON_ICONS: Record<string, LucideIcon> = {
  Star, Heart, Bookmark, Flag, Tag, Hash, Home, User, Users, Settings, Bell, Mail,
  Calendar, Clock, MapPin, Phone, Camera, Image, Folder, File, Archive, Trash2, Download, Upload,
  Search, Filter, Menu, MoreVertical, ChevronDown, ChevronUp, Plus, Minus, X, Check, AlertCircle, Info,
  Edit, Copy, Share, Link, ExternalLink, Lock, Code, Terminal, Database, Server, Cloud, Wifi,
  ShoppingCart, CreditCard, Package, Truck, Store, Music, Play, Pause, Volume2, Headphones, Mic,
  Book, BookOpen, FileText, PenTool, Highlighter, Type, Layout, Grid, List, Columns, Sidebar, Layers,
  Circle, Square, Triangle, Hexagon, Zap, Target, Rocket, Plane, Car, Bike, Ship, Train,
  Moon, Sun, CloudRain, CloudSnow, Wind, Thermometer, Github, Gitlab, Chrome,
  MessageSquare, MessageCircle, Send, AtSign, Percent, Newspaper, Palette, Gamepad2, Bot, Wrench,
};

export const COMMON_ICON_NAMES = Object.keys(COMMON_ICONS);

let fullSet: Record<string, unknown> | null = null;
let fullSetLoading: Promise<Record<string, unknown>> | null = null;

/** 懒加载完整图标集，返回 lucide 的全部导出。 */
export const loadAllIcons = () => {
  fullSetLoading ??= import('lucide-react').then(module => {
    fullSet = module as unknown as Record<string, unknown>;
    return fullSet;
  });
  return fullSetLoading;
};

const lookup = (name: string): LucideIcon | undefined =>
  COMMON_ICONS[name] || (fullSet?.[name] as LucideIcon | undefined);

interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

const Icon: React.FC<IconProps> = ({ name, size = 20, className }) => {
  const [, setLoaded] = React.useState(false);
  const IconComponent = lookup(name);

  React.useEffect(() => {
    if (!name || lookup(name)) return;
    let alive = true;
    void loadAllIcons().then(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [name]);

  const Resolved = IconComponent || Link;
  return <Resolved size={size} className={className} />;
};

export default Icon;
