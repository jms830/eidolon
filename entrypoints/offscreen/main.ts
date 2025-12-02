/**
 * Offscreen Document
 * 
 * Handles media processing tasks that require DOM APIs but shouldn't
 * interrupt the user's browsing experience:
 * - GIF generation from screenshots
 * - Audio playback for notifications
 * - Image processing
 */

console.log('[Offscreen] Document loaded and ready');

// ============ AUDIO PLAYBACK ============

// Initialize AudioContext immediately
const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
const audioContext = new AudioCtx();
console.log('[Offscreen] AudioContext created, state:', audioContext.state);

/**
 * Play audio using Web Audio API (bypasses autoplay restrictions better)
 */
async function playAudioWithWebAudioAPI(audioUrl: string, volume: number): Promise<void> {
  try {
    console.log('[Offscreen] Fetching audio file:', audioUrl);

    // Fetch the audio file
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();

    console.log('[Offscreen] Audio file fetched, decoding...');

    // Decode the audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    console.log('[Offscreen] Audio decoded, creating source...');

    // Create buffer source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // Create gain node for volume control
    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume;

    // Connect nodes
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Resume audio context if needed
    if (audioContext.state === 'suspended') {
      console.log('[Offscreen] Resuming AudioContext...');
      await audioContext.resume();
    }

    console.log('[Offscreen] Starting playback...');
    source.start(0);

    return new Promise((resolve, reject) => {
      source.onended = () => {
        console.log('[Offscreen] Playback finished');
        resolve();
      };
      (source as any).onerror = (error: any) => {
        console.error('[Offscreen] Source error:', error);
        reject(error);
      };
    });
  } catch (error) {
    console.error('[Offscreen] Web Audio API error:', error);
    throw error;
  }
}

// ============ GIF DRAWING FUNCTIONS ============

interface ActionData {
  type: string;
  coordinate?: [number, number];
  start_coordinate?: [number, number];
  description?: string;
}

interface EnhancementOptions {
  showClickIndicators: boolean;
  showDragPaths: boolean;
  showActionLabels: boolean;
  showProgressBar: boolean;
  showWatermark: boolean;
}

/**
 * Draw a click indicator (orange circle) on the canvas
 */
function drawClickIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scaleFactor = 1
) {
  ctx.save();

  // Outer glow
  ctx.beginPath();
  ctx.arc(x, y, 15 * scaleFactor, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(207, 107, 60, 0.3)';
  ctx.fill();

  // Inner circle
  ctx.beginPath();
  ctx.arc(x, y, 11 * scaleFactor, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(207, 107, 60, 0.5)';
  ctx.fill();

  // Border
  ctx.beginPath();
  ctx.arc(x, y, 11 * scaleFactor, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(207, 107, 60, 1)';
  ctx.lineWidth = 2 * scaleFactor;
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw a drag path with arrow on the canvas
 */
function drawDragPath(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  scaleFactor = 1
) {
  ctx.save();

  // Draw line
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 3 * scaleFactor;
  ctx.stroke();

  // Draw arrowhead at end
  const angle = Math.atan2(endY - startY, endX - startX);
  const arrowLength = 15 * scaleFactor;

  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - arrowLength * Math.cos(angle - Math.PI / 6),
    endY - arrowLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endX - arrowLength * Math.cos(angle + Math.PI / 6),
    endY - arrowLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = '#dc2626';
  ctx.fill();

  // Draw start marker
  ctx.beginPath();
  ctx.arc(startX, startY, 6 * scaleFactor, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#cf6b3c';
  ctx.lineWidth = 2 * scaleFactor;
  ctx.stroke();

  // Draw end marker
  ctx.beginPath();
  ctx.arc(endX, endY, 6 * scaleFactor, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2 * scaleFactor;
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw an action label on the canvas
 */
function drawActionLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scaleFactor = 1
) {
  ctx.save();

  // Set font
  const fontSize = 14 * scaleFactor;
  ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Measure text
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = 20 * scaleFactor;
  const padding = 8 * scaleFactor;

  // Adjust position if too close to edges
  let labelX = x + 20 * scaleFactor;
  let labelY = y - 10 * scaleFactor;

  if (labelX + textWidth + padding * 2 > ctx.canvas.width) {
    labelX = x - textWidth - padding * 2 - 20 * scaleFactor;
  }

  if (labelY < 0) {
    labelY = y + 20 * scaleFactor;
  }

  // Draw background with rounded corners
  const bgX = labelX;
  const bgY = labelY;
  const bgWidth = textWidth + padding * 2;
  const bgHeight = textHeight + padding;
  const radius = 6 * scaleFactor;

  ctx.beginPath();
  ctx.moveTo(bgX + radius, bgY);
  ctx.lineTo(bgX + bgWidth - radius, bgY);
  ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + radius);
  ctx.lineTo(bgX + bgWidth, bgY + bgHeight - radius);
  ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - radius, bgY + bgHeight);
  ctx.lineTo(bgX + radius, bgY + bgHeight);
  ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - radius);
  ctx.lineTo(bgX, bgY + radius);
  ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
  ctx.closePath();

  // Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 4 * scaleFactor;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2 * scaleFactor;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fill();

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Draw text
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, bgX + padding, bgY + padding);

  ctx.restore();
}

/**
 * Draw a progress bar at the bottom of the canvas
 */
function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  progress: number,
  scaleFactor = 1
) {
  ctx.save();

  const barHeight = 4 * scaleFactor;
  const barWidth = ctx.canvas.width;
  const progressWidth = barWidth * progress;
  const y = ctx.canvas.height - barHeight;

  // Draw background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, y, barWidth, barHeight);

  // Draw progress (Eidolon orange)
  ctx.fillStyle = '#C96442';
  ctx.fillRect(0, y, progressWidth, barHeight);

  ctx.restore();
}

/**
 * Draw watermark (Eidolon logo placeholder)
 */
function drawWatermark(ctx: CanvasRenderingContext2D, scaleFactor = 1) {
  ctx.save();

  const padding = 8 * scaleFactor;
  const logoSize = 32 * scaleFactor;
  const x = ctx.canvas.width - padding - logoSize;
  const y = ctx.canvas.height - padding - logoSize - 4 * scaleFactor;

  // Draw rounded square background
  const radius = logoSize * 0.234;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + logoSize - radius, y);
  ctx.quadraticCurveTo(x + logoSize, y, x + logoSize, y + radius);
  ctx.lineTo(x + logoSize, y + logoSize - radius);
  ctx.quadraticCurveTo(x + logoSize, y + logoSize, x + logoSize - radius, y + logoSize);
  ctx.lineTo(x + radius, y + logoSize);
  ctx.quadraticCurveTo(x, y + logoSize, x, y + logoSize - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  // Gradient background (Eidolon orange)
  const gradient = ctx.createLinearGradient(x, y + logoSize, x, y);
  gradient.addColorStop(0, '#DC6038');
  gradient.addColorStop(1, '#D97757');
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw "E" for Eidolon
  ctx.font = `bold ${logoSize * 0.6}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(250, 249, 245, 0.9)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('E', x + logoSize / 2, y + logoSize / 2);

  ctx.restore();
}

/**
 * Apply action indicators to a canvas based on action metadata
 */
function applyActionIndicators(
  canvas: HTMLCanvasElement,
  action: ActionData | undefined,
  options: EnhancementOptions,
  scaleFactor = 1
) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !action) return;

  // Draw click indicator
  if (
    options.showClickIndicators &&
    action.coordinate &&
    (action.type.includes('click') || action.type === 'scroll')
  ) {
    const [x, y] = action.coordinate;
    const scaledX = x * scaleFactor;
    const scaledY = y * scaleFactor;
    drawClickIndicator(ctx, scaledX, scaledY, scaleFactor);

    if (options.showActionLabels && action.description) {
      drawActionLabel(ctx, action.description, scaledX, scaledY, scaleFactor);
    }
  }

  // Draw drag path
  if (
    options.showDragPaths &&
    action.type === 'left_click_drag' &&
    action.start_coordinate &&
    action.coordinate
  ) {
    const [startX, startY] = action.start_coordinate;
    const [endX, endY] = action.coordinate;
    const scaledStartX = startX * scaleFactor;
    const scaledStartY = startY * scaleFactor;
    const scaledEndX = endX * scaleFactor;
    const scaledEndY = endY * scaleFactor;
    drawDragPath(ctx, scaledStartX, scaledStartY, scaledEndX, scaledEndY, scaleFactor);

    if (options.showActionLabels && action.description) {
      drawActionLabel(ctx, action.description, scaledEndX, scaledEndY, scaleFactor);
    }
  }

  // Draw action label for non-coordinate actions
  if (
    options.showActionLabels &&
    action.description &&
    !action.coordinate &&
    (action.type === 'type' || action.type === 'key' || action.type === 'wait')
  ) {
    drawActionLabel(ctx, action.description, 20 * scaleFactor, 20 * scaleFactor, scaleFactor);
  }
}

// ============ GIF GENERATION ============

interface FrameData {
  base64: string;
  format?: string;
  delay?: number;
  action?: ActionData;
  viewportWidth?: number;
  viewportHeight?: number;
}

interface GifOptions {
  quality?: number;
  showClickIndicators?: boolean;
  showDragPaths?: boolean;
  showActionLabels?: boolean;
  showProgressBar?: boolean;
  showWatermark?: boolean;
}

/**
 * GIF generation function with full enhancement support
 * Note: This requires gif.js library to be loaded
 */
async function generateGif(
  frames: FrameData[],
  options: GifOptions = {}
): Promise<{ base64: string; size: number; width: number; height: number }> {
  console.log(`[Offscreen] Generating GIF from ${frames.length} frames`);
  console.log('[Offscreen] Options:', options);

  // Check if GIF library is available
  if (typeof (window as any).GIF === 'undefined') {
    throw new Error('GIF library not loaded');
  }

  // Default options
  const enhancementOptions: EnhancementOptions = {
    showClickIndicators: options.showClickIndicators ?? true,
    showDragPaths: options.showDragPaths ?? true,
    showActionLabels: options.showActionLabels ?? true,
    showProgressBar: options.showProgressBar ?? true,
    showWatermark: options.showWatermark ?? true,
  };

  // Load all images first
  const images = await Promise.all(
    frames.map((frame, index) => {
      console.log(`[Offscreen] Loading image ${index + 1}/${frames.length}`);
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          console.log(`[Offscreen] Image ${index + 1} loaded: ${img.width}x${img.height}`);
          resolve(img);
        };
        img.onerror = reject;
        const dataUrl = `data:image/${frame.format || 'png'};base64,${frame.base64}`;
        img.src = dataUrl;
      });
    })
  );

  console.log(`[Offscreen] All ${images.length} images loaded`);

  const width = images[0].width;
  const height = images[0].height;

  console.log('[Offscreen] Enhancing frames with indicators and overlays...');

  // Create enhanced canvases with all indicators and overlays
  const enhancedCanvases = images.map((img, index) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;

    // Draw the base image
    ctx.drawImage(img, 0, 0);

    // Apply action indicators
    const frame = frames[index];
    let scaleFactor = 1;
    if (frame.viewportWidth && canvas.width) {
      scaleFactor = canvas.width / frame.viewportWidth;
    }

    if (frame.action) {
      applyActionIndicators(canvas, frame.action, enhancementOptions, scaleFactor);
    }

    // Apply overlays
    const progress = (index + 1) / images.length;

    if (enhancementOptions.showProgressBar) {
      drawProgressBar(ctx, progress, scaleFactor);
    }

    if (enhancementOptions.showWatermark) {
      drawWatermark(ctx, scaleFactor);
    }

    return canvas;
  });

  console.log(`[Offscreen] Creating GIF encoder: ${width}x${height}`);

  // Get frame delays
  const frameDelays = frames.map((frame, index) => {
    const baseDelay = frame.delay || 800;
    const isLastFrame = index === frames.length - 1;
    return isLastFrame ? baseDelay + 2000 : baseDelay;
  });

  return new Promise((resolve, reject) => {
    const GIF = (window as any).GIF;
    const gif = new GIF({
      workers: 2,
      quality: options.quality || 10,
      width,
      height,
      workerScript: chrome.runtime.getURL('gif.worker.js'),
      repeat: 0,
      debug: true,
    });

    gif.on('progress', (percent: number) => {
      console.log(`[Offscreen] GIF encoding progress: ${Math.round(percent * 100)}%`);
    });

    gif.on('finished', (blob: Blob) => {
      console.log(`[Offscreen] GIF created: ${blob.size} bytes`);

      // Convert blob to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        console.log(`[Offscreen] Conversion complete, base64 length: ${base64.length}`);
        resolve({
          base64,
          size: blob.size,
          width,
          height,
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

    gif.on('abort', () => reject(new Error('GIF rendering aborted')));

    // Add all enhanced frames
    enhancedCanvases.forEach((canvas, index) => {
      gif.addFrame(canvas, { delay: frameDelays[index] });
    });

    console.log('[Offscreen] Starting GIF rendering...');
    gif.render();
  });
}

// ============ MESSAGE LISTENER ============

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PLAY_NOTIFICATION_SOUND') {
    console.log('[Offscreen] Received PLAY_NOTIFICATION_SOUND message');

    const volume = message.volume || 0.5;

    playAudioWithWebAudioAPI(message.audioUrl, volume)
      .then(() => {
        console.log('[Offscreen] Sound played successfully');
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('[Offscreen] Failed to play sound:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Async response
  }

  if (message.type === 'GENERATE_GIF') {
    console.log('[Offscreen] Received GENERATE_GIF message');
    console.log(`[Offscreen] Frames: ${message.frames?.length}`);

    generateGif(message.frames, message.options)
      .then((result) => {
        console.log('[Offscreen] GIF generated successfully');
        sendResponse({ success: true, result });
      })
      .catch((error) => {
        console.error('[Offscreen] Failed to generate GIF:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Async response
  }

  return false;
});
