(function initMosaicComposer(global) {
  "use strict";

  const CANVAS_WIDTH = 1440;
  const CANVAS_HEIGHT = 810;
  const COLUMN_WIDTH = CANVAS_WIDTH / 9;
  const PANEL_WIDTH = COLUMN_WIDTH * 2;
  const PANEL_PADDING = 16;
  const BASE_BLOCK_SIZES = Object.freeze([44, 22, 11]);
  const STRENGTH_SCALES = Object.freeze([0.85, 1, 1.2, 1.45, 1.75, 2.15]);
  const MIN_BLOCK_SIZE = 3;
  const MAX_BLOCK_SIZE = 160;
  const PANEL_START_COLUMNS = Object.freeze([0, 2, 4, 7]);

  function normalizeStrength(value) {
    const number = Math.round(Number(value) || 4);
    return Math.max(1, Math.min(STRENGTH_SCALES.length, number));
  }

  function getBlockSizes(strength) {
    const scale = STRENGTH_SCALES[normalizeStrength(strength) - 1];
    return BASE_BLOCK_SIZES.map(size => Math.max(MIN_BLOCK_SIZE, Math.round(size * scale)));
  }

  function resolveBlockSizes(blockSizes, strength) {
    if (blockSizes == null) return getBlockSizes(strength);
    if (!Array.isArray(blockSizes) || blockSizes.length !== 3) {
      throw new Error("马赛克块大小设置无效");
    }
    const values = blockSizes.map(value => Math.round(Number(value)));
    if (values.some(value => !Number.isFinite(value) || value < MIN_BLOCK_SIZE || value > MAX_BLOCK_SIZE)) {
      throw new Error(`马赛克块大小应为 ${MIN_BLOCK_SIZE}–${MAX_BLOCK_SIZE} 的整数`);
    }
    if (!(values[0] > values[1] && values[1] > values[2])) {
      throw new Error("马赛克块大小应满足：强 > 中 > 弱");
    }
    return values;
  }

  function getPanelRect(panelIndex) {
    const index = Math.max(0, Math.min(PANEL_START_COLUMNS.length - 1, Math.round(Number(panelIndex) || 0)));
    return {
      x: PANEL_START_COLUMNS[index] * COLUMN_WIDTH,
      y: 0,
      width: PANEL_WIDTH,
      height: CANVAS_HEIGHT,
    };
  }

  function calculateContainRect(sourceWidth, sourceHeight, panelRect, padding = PANEL_PADDING) {
    const width = Number(sourceWidth);
    const height = Number(sourceHeight);
    if (!(width > 0) || !(height > 0)) {
      throw new Error("人物图片尺寸无效");
    }

    const safePadding = Math.max(0, Math.min(Number(padding) || 0, panelRect.width / 2, panelRect.height / 2));
    const availableWidth = panelRect.width - safePadding * 2;
    const availableHeight = panelRect.height - safePadding * 2;
    const scale = Math.min(availableWidth / width, availableHeight / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    return {
      x: panelRect.x + safePadding + (availableWidth - drawWidth) / 2,
      y: panelRect.y + safePadding + (availableHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    };
  }

  function drawPixelated(ctx, image, destination, blockSize, canvasFactory) {
    const sampleWidth = Math.max(1, Math.round(destination.width / blockSize));
    const sampleHeight = Math.max(1, Math.round(destination.height / blockSize));
    const sampleCanvas = canvasFactory(sampleWidth, sampleHeight);
    const sampleCtx = sampleCanvas.getContext("2d", { alpha: false });
    if (!sampleCtx) throw new Error("浏览器无法创建马赛克画布");

    sampleCtx.fillStyle = "#ffffff";
    sampleCtx.fillRect(0, 0, sampleWidth, sampleHeight);
    sampleCtx.imageSmoothingEnabled = true;
    sampleCtx.imageSmoothingQuality = "high";
    sampleCtx.drawImage(image, 0, 0, sampleWidth, sampleHeight);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sampleCanvas,
      0,
      0,
      sampleWidth,
      sampleHeight,
      destination.x,
      destination.y,
      destination.width,
      destination.height
    );
    ctx.restore();
  }

  async function composeFromBlob(imageBlob, options = {}) {
    if (!(imageBlob instanceof Blob) || !imageBlob.size) {
      throw new Error("人物图片为空");
    }

    const canvasFactory = options.canvasFactory || defaultCanvasFactory;
    const decoded = await decodeImageBlob(imageBlob);

    try {
      const canvas = canvasFactory(CANVAS_WIDTH, CANVAS_HEIGHT);
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("浏览器无法创建输出画布");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const blockSizes = resolveBlockSizes(options.blockSizes, options.strength);
      for (let i = 0; i < 3; i++) {
        const panel = getPanelRect(i);
        const destination = calculateContainRect(decoded.width, decoded.height, panel);
        ctx.save();
        ctx.beginPath();
        ctx.rect(panel.x, panel.y, panel.width, panel.height);
        ctx.clip();
        drawPixelated(ctx, decoded.image, destination, blockSizes[i], canvasFactory);
        ctx.restore();
      }

      const originalPanel = getPanelRect(3);
      const originalDestination = calculateContainRect(decoded.width, decoded.height, originalPanel);
      ctx.save();
      ctx.beginPath();
      ctx.rect(originalPanel.x, originalPanel.y, originalPanel.width, originalPanel.height);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        decoded.image,
        originalDestination.x,
        originalDestination.y,
        originalDestination.width,
        originalDestination.height
      );
      ctx.restore();

      return await canvasToBlob(canvas, options.type || "image/jpeg", options.quality ?? 0.92);
    } finally {
      decoded.close();
    }
  }

  function defaultCanvasFactory(width, height) {
    if (typeof document === "undefined") {
      throw new Error("当前环境不支持 Canvas");
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  async function decodeImageBlob(blob) {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob);
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    }

    if (typeof Image === "undefined" || typeof URL === "undefined") {
      throw new Error("当前浏览器无法解码人物图片");
    }

    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("人物图片解码失败"));
        element.src = objectUrl;
      });
      return {
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => URL.revokeObjectURL(objectUrl),
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob && blob.size) resolve(blob);
        else reject(new Error("马赛克图片导出失败"));
      }, type, quality);
    });
  }

  global.MosaicComposer = Object.freeze({
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    COLUMN_WIDTH,
    PANEL_WIDTH,
    PANEL_PADDING,
    MIN_BLOCK_SIZE,
    MAX_BLOCK_SIZE,
    normalizeStrength,
    getBlockSizes,
    resolveBlockSizes,
    getPanelRect,
    calculateContainRect,
    composeFromBlob,
  });
})(globalThis);
