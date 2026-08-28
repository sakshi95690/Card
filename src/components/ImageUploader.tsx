import React, { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { Upload, Image as ImageIcon, RotateCw, ZoomIn, ZoomOut, Check, X } from 'lucide-react';

interface ImageUploaderProps {
  onImageSelected: (dataUrl: string) => void;
  currentImage?: string;
  error?: string;
}

export default function ImageUploader({ onImageSelected, currentImage, error }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(currentImage);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (file: File) => {
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Please upload a valid image file (JPG, JPEG, PNG, or WEBP).');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      alert('File size exceeds 15MB. Please choose a smaller photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setRawImageSrc(result);
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setIsModalOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDraggingImage(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingImage) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDraggingImage(false);
  };

  // Touch support for mobile panning
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDraggingImage(true);
      setDragStart({
        x: e.touches[0].clientX - offset.x,
        y: e.touches[0].clientY - offset.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingImage || e.touches.length !== 1) return;
    setOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const generateSquare1080Image = () => {
    if (!rawImageSrc) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const targetSize = 600;
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Enable high quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Background fill
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetSize, targetSize);

      ctx.save();
      ctx.translate(targetSize / 2, targetSize / 2);
      ctx.rotate((rotation * Math.PI) / 180);

      // Calculate scale to fit/cover in targetSize x targetSize
      const baseScale = Math.max(targetSize / img.width, targetSize / img.height);
      const totalScale = baseScale * zoom;

      // Convert preview offset (from 240px box to targetSize canvas)
      const scaleFactor = targetSize / 240;
      const adjustedOffsetX = offset.x * scaleFactor;
      const adjustedOffsetY = offset.y * scaleFactor;

      const drawWidth = img.width * totalScale;
      const drawHeight = img.height * totalScale;

      ctx.drawImage(
        img,
        -drawWidth / 2 + adjustedOffsetX,
        -drawHeight / 2 + adjustedOffsetY,
        drawWidth,
        drawHeight
      );

      ctx.restore();

      const finalDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setPreviewUrl(finalDataUrl);
      onImageSelected(finalDataUrl);
      setIsModalOpen(false);
    };
    img.src = rawImageSrc;
  };

  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
        Upload Photo (1:1 Square) <span className="text-[#1E40AF]">*</span>
      </label>

      <input
        ref={fileInputRef}
        id="volunteer-image-input"
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {!previewUrl ? (
        <div
          id="image-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`cursor-pointer border-2 border-dashed rounded-xl p-3.5 sm:p-4 text-center transition-all duration-200 flex flex-col items-center justify-center min-h-[110px] bg-blue-50/20 hover:bg-blue-50/50 ${
            isDragging
              ? 'border-[#1E40AF] bg-blue-100/50'
              : error
              ? 'border-red-400 bg-red-50/30'
              : 'border-blue-200 hover:border-blue-300'
          }`}
        >
          <div className="w-9 h-9 rounded-full blue-gradient text-white flex items-center justify-center shadow-sm mb-1.5">
            <Upload className="w-4 h-4" />
          </div>
          <p className="text-xs font-bold text-slate-800">
            Click to upload photo
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            JPG, PNG, WEBP (Square format recommended)
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-2.5 rounded-xl border border-blue-200 bg-blue-50/20">
          <div className="relative group w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden shadow-xs border-2 border-[#1E40AF] shrink-0 bg-white">
            <img
              src={previewUrl}
              alt="Volunteer Preview"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Photo ready
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                id="adjust-crop-btn"
                onClick={() => {
                  setRawImageSrc(previewUrl);
                  setZoom(1);
                  setRotation(0);
                  setOffset({ x: 0, y: 0 });
                  setIsModalOpen(true);
                }}
                className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-[#1E40AF] text-[11px] font-bold rounded-md transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RotateCw className="w-3 h-3" /> Crop / Adjust
              </button>
              <button
                type="button"
                id="change-photo-btn"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 cursor-pointer"
              >
                <ImageIcon className="w-3 h-3" /> Change
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-[11px] font-medium text-red-600 mt-0.5">{error}</p>}

      {/* Crop & Adjust Modal */}
      {isModalOpen && rawImageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 shadow-2xl space-y-3 border border-blue-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h3 className="text-sm font-bold text-[#1E40AF] font-serif-cultural">
                  Crop & Frame Photo
                </h3>
                <p className="text-[10px] text-slate-500">
                  Drag to move, zoom or rotate to square frame
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1:1 Viewport Box */}
            <div className="flex justify-center">
              <div
                className="relative w-[230px] h-[230px] sm:w-[240px] sm:h-[240px] rounded-xl overflow-hidden border-2 border-[#1E40AF] bg-neutral-900 cursor-grab active:cursor-grabbing select-none shadow-inner"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUp}
              >
                {/* 1:1 Grid Overlay guidelines */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none z-10 opacity-30 border border-white/20">
                  <div className="border-r border-b border-white/30" />
                  <div className="border-r border-b border-white/30" />
                  <div className="border-b border-white/30" />
                  <div className="border-r border-b border-white/30" />
                  <div className="border-r border-b border-white/30" />
                  <div className="border-b border-white/30" />
                  <div className="border-r border-b border-white/30" />
                  <div className="border-r border-b border-white/30" />
                  <div />
                </div>

                <div
                  className="w-full h-full flex items-center justify-center pointer-events-none"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
                    transformOrigin: 'center center',
                    transition: isDraggingImage ? 'none' : 'transform 0.05s ease-out',
                  }}
                >
                  <img
                    src={rawImageSrc}
                    alt="Crop workspace"
                    className="max-w-none pointer-events-none"
                    style={{
                      width: '240px',
                      height: '240px',
                      objectFit: 'contain',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Zoom Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                <span>Zoom Scale</span>
                <span>{Math.round(zoom * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <ZoomOut className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                  type="range"
                  min="0.8"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full accent-[#1E40AF] h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
                <ZoomIn className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              </div>
            </div>

            {/* Rotation Control */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-semibold text-slate-700">Rotate Angle</span>
              <button
                type="button"
                onClick={() => setRotation((prev) => (prev + 90) % 360)}
                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#1E40AF] rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border border-blue-200"
              >
                <RotateCw className="w-3 h-3" /> Rotate 90° ({rotation}°)
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="save-square-photo-btn"
                onClick={generateSquare1080Image}
                className="flex-1 py-2 px-3 rounded-lg blue-gradient text-xs font-bold text-white shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1 hover:opacity-95"
              >
                <Check className="w-3.5 h-3.5" /> Save Image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
