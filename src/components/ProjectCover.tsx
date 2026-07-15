import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
import type { CoverMotif, CoverStroke, ResearchProject, ResearchProjectCover } from "../../shared/research-project";

export function coverBackground(project: Pick<ResearchProject, "cover">): CSSProperties {
  const { cover } = project;
  if (cover.backgroundType === "image" && cover.image?.dataUrl) {
    const scale = Math.max(1, cover.image.scale || 1);
    return {
      backgroundColor: cover.solidColor,
      backgroundImage: `linear-gradient(${withAlpha(cover.image.overlayColor, cover.image.overlayOpacity)}, ${withAlpha(cover.image.overlayColor, cover.image.overlayOpacity)}), url(${cover.image.dataUrl})`,
      backgroundPosition: `${cover.image.x}% ${cover.image.y}%`,
      backgroundSize: cover.image.fit === "contain" ? `${scale * 100}% auto` : scale === 1 ? "cover" : `${scale * 100}%`,
      backgroundRepeat: "no-repeat",
    };
  }
  return cover.backgroundType === "gradient"
    ? { background: `linear-gradient(${cover.gradientAngle}deg, ${cover.gradientStart}, ${cover.gradientEnd})` }
    : { background: cover.solidColor };
}

function withAlpha(color: string, opacity: number) {
  return `${color}${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, "0")}`;
}

function luminance(hex: string) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return 0.5;
  const rgb = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255).map((v) => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}

export function automaticCoverTextColor(cover: ResearchProjectCover) {
  if (cover.backgroundType === "image") return "#ffffff";
  const colors = cover.backgroundType === "gradient" ? [cover.gradientStart, cover.gradientEnd] : [cover.solidColor];
  const average = colors.reduce((sum, color) => sum + luminance(color), 0) / colors.length;
  return average > .42 ? "#111317" : "#ffffff";
}

export function coverBrandText(cover: ResearchProjectCover) {
  const lines = (cover.metadataText || "RESEARCH PROJECT\nMISHIRU").split("\n").map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] || "MISHIRU";
}

const blockStyle = (block: ResearchProject["cover"]["title"], color: string, interactive = false, selected = false): CSSProperties => ({
  position: "absolute", left: `${block.x}%`, top: `${block.y}%`, width: `${block.width}%`,
  color, fontFamily: block.fontFamily, fontSize: `calc(${block.fontSize} / 300 * 100cqw)`, fontWeight: block.fontWeight,
  lineHeight: block.lineHeight, letterSpacing: `calc(${block.letterSpacing} / 300 * 100cqw)`, textAlign: block.align,
  cursor: interactive ? "move" : undefined, outline: selected ? "2px solid #dff000" : undefined,
  outlineOffset: selected ? "4px" : undefined, touchAction: interactive ? "none" : undefined,
});

type EditableBlockKey = "title" | "subtitle" | "metadata" | `custom:${string}`;

export function ProjectCover({ project, compact = false, editable = false, selectedBlock, drawing = false, erasing = false, backgroundEditing = false, drawColor = "#dff000", drawWidth = 4, drawOpacity = .8, onSelectBlock, onBlockPositionChange, onTextChange, onMotifPositionChange, onStrokeChange, onEraseAt, onBackgroundChange }: {
  project: ResearchProject;
  compact?: boolean;
  editable?: boolean;
  selectedBlock?: EditableBlockKey;
  drawing?: boolean;
  erasing?: boolean;
  backgroundEditing?: boolean;
  drawColor?: string;
  drawWidth?: number;
  drawOpacity?: number;
  onSelectBlock?: (key: EditableBlockKey) => void;
  onBlockPositionChange?: (key: EditableBlockKey, x: number, y: number) => void;
  onTextChange?: (key: EditableBlockKey, value: string) => void;
  onMotifPositionChange?: (id: string, x: number, y: number) => void;
  onStrokeChange?: (stroke: CoverStroke) => void;
  onEraseAt?: (point: { x: number; y: number }) => void;
  onBackgroundChange?: (patch: { x?: number; y?: number; scale?: number }) => void;
}) {
  const [editingKey, setEditingKey] = useState<EditableBlockKey | null>(null);
  const dragRef = useRef<{ key: EditableBlockKey; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const motifDragRef = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const backgroundDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const strokeRef = useRef<CoverStroke | null>(null);
  const autoEnabled = project.cover.autoTextContrast !== false;
  const autoColor = autoEnabled ? automaticCoverTextColor(project.cover) : null;
  const [sampledColors, setSampledColors] = useState<Record<string, string>>({});
  const motifs: CoverMotif[] = project.cover.motifs?.length ? project.cover.motifs : project.cover.motif ? [{ id: "legacy-motif", ...project.cover.motif }] : [];

  useEffect(() => {
    if (!autoEnabled || project.cover.backgroundType !== "image" || !project.cover.image?.dataUrl) { setSampledColors({}); return; }
    let cancelled = false;
    sampleImageTextColors(project).then((colors) => { if (!cancelled) setSampledColors(colors); }).catch(() => { if (!cancelled) setSampledColors({}); });
    return () => { cancelled = true; };
  }, [autoEnabled, project.cover.backgroundType, project.cover.image?.dataUrl, project.cover.image?.x, project.cover.image?.y, project.cover.image?.scale, project.cover.image?.fit, project.cover.image?.overlayColor, project.cover.image?.overlayOpacity, project.cover.readabilityOverlay?.color, project.cover.readabilityOverlay?.opacity, project.cover.title.x, project.cover.title.y, project.cover.subtitle.x, project.cover.subtitle.y, project.cover.metadata.x, project.cover.metadata.y, project.cover.textBoxes, project.displayTitle, project.subtitle]);

  const startDrag = (event: PointerEvent<HTMLElement>, key: EditableBlockKey, x: number, y: number) => {
    if (backgroundEditing) { event.stopPropagation(); return; }
    if (!editable || drawing || editingKey === key) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { key, startX: event.clientX, startY: event.clientY, originX: x, originY: y };
    onSelectBlock?.(key);
  };
  const startMotifDrag = (event: PointerEvent<HTMLImageElement>, motif: CoverMotif) => {
    if (backgroundEditing) { event.stopPropagation(); return; }
    if (!editable || drawing) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    motifDragRef.current = { id: motif.id, startX: event.clientX, startY: event.clientY, originX: motif.x, originY: motif.y };
  };
  const startStroke = (event: PointerEvent<HTMLDivElement>) => {
    if (erasing && onEraseAt) { event.currentTarget.setPointerCapture(event.pointerId); onEraseAt(coverPoint(event)); return; }
    if (!drawing || !onStrokeChange) return;
    const point = coverPoint(event);
    const stroke = { id: `stroke-${Date.now()}`, color: drawColor, width: drawWidth, opacity: drawOpacity, points: [point] };
    strokeRef.current = stroke; event.currentTarget.setPointerCapture(event.pointerId); onStrokeChange(stroke);
  };
  const startBackgroundDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!backgroundEditing || !project.cover.image || !onBackgroundChange) return false;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    backgroundDragRef.current = { startX:event.clientX, startY:event.clientY, originX:project.cover.image.x, originY:project.cover.image.y };
    return true;
  };
  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (erasing && event.buttons && onEraseAt) { onEraseAt(coverPoint(event)); return; }
    if (strokeRef.current && onStrokeChange) {
      const stroke = { ...strokeRef.current, points: [...strokeRef.current.points, coverPoint(event)] };
      strokeRef.current = stroke; onStrokeChange(stroke); return;
    }
    if (motifDragRef.current && onMotifPositionChange) {
      const drag = motifDragRef.current;
      onMotifPositionChange(drag.id, clamp(drag.originX + ((event.clientX - drag.startX) / rect.width) * 100), clamp(drag.originY + ((event.clientY - drag.startY) / rect.height) * 100));
      return;
    }
    if (backgroundDragRef.current && onBackgroundChange) {
      const drag = backgroundDragRef.current;
      onBackgroundChange({x:clamp(drag.originX+((event.clientX-drag.startX)/rect.width)*100),y:clamp(drag.originY+((event.clientY-drag.startY)/rect.height)*100)});
      return;
    }
    const drag = dragRef.current;
    if (!drag || !onBlockPositionChange) return;
    onBlockPositionChange(drag.key, clamp(drag.originX + ((event.clientX - drag.startX) / rect.width) * 100), clamp(drag.originY + ((event.clientY - drag.startY) / rect.height) * 100));
  };
  const endPointer = () => { dragRef.current = null; motifDragRef.current = null; backgroundDragRef.current = null; strokeRef.current = null; };
  const zoomBackground = (event: WheelEvent<HTMLDivElement>) => { if (!backgroundEditing || !project.cover.image || !onBackgroundChange) return; event.preventDefault(); onBackgroundChange({scale:Math.max(1,Math.min(3,project.cover.image.scale+(event.deltaY<0?.08:-.08)))}); };
  const coverPoint = (event: PointerEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: clamp(((event.clientX - rect.left) / rect.width) * 100), y: clamp(((event.clientY - rect.top) / rect.height) * 100) }; };
  const textLayer = (key: EditableBlockKey, text: string, block: ResearchProject["cover"]["title"], Tag: "strong" | "span" | "small") => {
    const color = sampledColors[key] || autoColor || block.color;
    const style = {...blockStyle(block, color, editable && !drawing, selectedBlock === key),"--cover-font-size":`calc(${block.fontSize} / 300 * 100cqw)`,textShadow:autoEnabled?(color==="#ffffff"?"0 1px 3px rgba(0,0,0,.9),0 0 10px rgba(0,0,0,.38)":"0 1px 2px rgba(255,255,255,.92),0 0 8px rgba(255,255,255,.44)"):undefined} as CSSProperties;
    return <Tag key={key} style={style} contentEditable={editable && editingKey === key} suppressContentEditableWarning
      title={editable ? "ドラッグで移動・ダブルクリックで編集" : undefined}
      onPointerDown={(event) => startDrag(event, key, block.x, block.y)}
      onDoubleClick={(event: MouseEvent<HTMLElement>) => { if (!editable || drawing) return; event.preventDefault(); event.stopPropagation(); setEditingKey(key); onSelectBlock?.(key); requestAnimationFrame(() => event.currentTarget.focus()); }}
      onClick={(event: MouseEvent<HTMLElement>) => { if (editable) { event.preventDefault(); event.stopPropagation(); onSelectBlock?.(key); } }}
      onInput={(event: FormEvent<HTMLElement>) => onTextChange?.(key, event.currentTarget.textContent || "")}
      onBlur={() => setEditingKey(null)}>{text}</Tag>;
  };
  return <div className={`project-book-cover ${compact ? "is-compact" : ""} ${editable ? "is-editable" : ""} ${drawing ? "is-drawing" : ""} ${erasing ? "is-erasing" : ""} ${backgroundEditing ? "is-background-editing" : ""}`} style={coverBackground(project)} onPointerDown={(event)=>{if(!startBackgroundDrag(event))startStroke(event);}} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onWheel={zoomBackground}>
    {backgroundEditing && project.cover.image && <div className="project-book-cover__crop-frame" aria-hidden="true"><i/><i/><i/><i/><span>ドラッグで位置調整 ・ スクロールで拡大縮小</span></div>}
    {motifs.map((motif) => <img key={motif.id} className="project-book-cover__motif" src={motif.dataUrl} alt={motif.name || "追加モチーフ"} onPointerDown={(event) => startMotifDrag(event, motif)} style={{
      left:`${motif.x}%`, top:`${motif.y}%`, width:`${motif.scale}%`, opacity:motif.opacity,
      transform:`translate(-50%,-50%) rotate(${motif.rotation}deg)`, cursor:editable&&!drawing?"move":undefined,
      filter:`drop-shadow(0 ${Math.max(2,motif.shadow/3)}px ${motif.shadow}px rgba(0,0,0,.28))`,
    }}/>) }
    {project.cover.readabilityOverlay && project.cover.readabilityOverlay.opacity > 0 && <div className="project-book-cover__overlay" style={{background:project.cover.readabilityOverlay.color,opacity:project.cover.readabilityOverlay.opacity}}/>}
    <svg className="project-book-cover__drawing" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{project.cover.strokes?.map((stroke) => <polyline key={stroke.id} points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={stroke.color} strokeWidth={stroke.width/3} strokeOpacity={stroke.opacity} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>)}</svg>
    <div className="project-book-cover__shine" />
    {textLayer("title", project.displayTitle, project.cover.title, "strong")}
    {textLayer("subtitle", project.subtitle, project.cover.subtitle, "span")}
    {textLayer("metadata", project.cover.metadataText || "RESEARCH PROJECT\nMISHIRU", project.cover.metadata, "small")}
    {project.cover.textBoxes?.map((box) => textLayer(`custom:${box.id}`, box.text, box.block, "span"))}
  </div>;
}

function clamp(value: number) { return Math.round(Math.max(0, Math.min(95, value)) * 10) / 10; }

async function sampleImageTextColors(project: ResearchProject) {
  const imageData = project.cover.image!; const width=300, height=425;
  const image = new Image(); image.src=imageData.dataUrl; await image.decode();
  const canvas=document.createElement("canvas"); canvas.width=width; canvas.height=height; const context=canvas.getContext("2d",{willReadFrequently:true}); if(!context)return {};
  context.fillStyle=project.cover.solidColor;context.fillRect(0,0,width,height);
  const base=imageData.fit==="contain"?Math.min(width/image.naturalWidth,height/image.naturalHeight):Math.max(width/image.naturalWidth,height/image.naturalHeight);
  const drawWidth=image.naturalWidth*base*Math.max(1,imageData.scale||1), drawHeight=image.naturalHeight*base*Math.max(1,imageData.scale||1);
  context.drawImage(image,(width-drawWidth)*(imageData.x/100),(height-drawHeight)*(imageData.y/100),drawWidth,drawHeight);
  if(imageData.overlayOpacity){context.fillStyle=withAlpha(imageData.overlayColor,imageData.overlayOpacity);context.fillRect(0,0,width,height);}
  if(project.cover.readabilityOverlay?.opacity){context.fillStyle=withAlpha(project.cover.readabilityOverlay.color,project.cover.readabilityOverlay.opacity);context.fillRect(0,0,width,height);}
  const blocks:[string,ResearchProjectCover["title"]][]=[["title",project.cover.title],["subtitle",project.cover.subtitle],["metadata",project.cover.metadata],...(project.cover.textBoxes||[]).map((box)=>[`custom:${box.id}`,box.block] as [string,ResearchProjectCover["title"]])];
  return Object.fromEntries(blocks.map(([key,block])=>{const x=Math.max(0,Math.floor(block.x/100*width)),y=Math.max(0,Math.floor(block.y/100*height)),w=Math.max(8,Math.min(width-x,Math.floor(block.width/100*width))),h=Math.max(8,Math.min(height-y,Math.ceil(block.fontSize*block.lineHeight*2)));const pixels=context.getImageData(x,y,w,h).data;let total=0,count=0;for(let i=0;i<pixels.length;i+=16){const r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255;total+=.2126*r+.7152*g+.0722*b;count++;}return [key,total/Math.max(1,count)>.54?"#111317":"#ffffff"];}));
}
