import _ from "lodash"
import sharp from "sharp"
import {PassThrough, Writable} from "stream";
import {pipeline} from "stream/promises";
import axios from "axios";

type FrameCacheEntry = {
  buffer: Buffer;
  width: number;
  height: number;
};

const FRAME_CACHE_LIMIT = 5;
const frameCache = new Map<string, FrameCacheEntry>();

async function getFrameFromCache(frameUrl: string): Promise<FrameCacheEntry> {
  // Hit: обновляем порядок (LRU) и возвращаем
  const cached = frameCache.get(frameUrl);
  if (cached) {
    frameCache.delete(frameUrl);
    frameCache.set(frameUrl, cached);
    return cached;
  }

  // Miss: скачиваем, читаем метаданные и кладём в кэш
  const frameResponse = await axios.get<ArrayBuffer>(frameUrl, {responseType: "arraybuffer"});
  const buffer = Buffer.from(frameResponse.data);
  const meta = await sharp(buffer).metadata();

  if (!meta.width || !meta.height) {
    throw new Error("Cannot get size of the frame picture");
  }

  const entry: FrameCacheEntry = {
    buffer,
    width: meta.width,
    height: meta.height
  };

  // LRU: если в кэше уже FRAME_CACHE_LIMIT элементов, удаляем самый старый
  if (frameCache.size >= FRAME_CACHE_LIMIT) {
    const oldestKey = frameCache.keys().next().value;
    if (oldestKey !== undefined) {
      frameCache.delete(oldestKey);
    }
  }

  frameCache.set(frameUrl, entry);
  return entry;
}

export async function resizePicture(
  inputStream: ReadableStream,
  outputStream: Writable,
  minWidth: number,
  minHeight: number,
  aspectRatioStr?: string
): Promise<void> {
  const abortController = new AbortController();
  const passThrough = new PassThrough();

  const sharpInstance = sharp();

  pipeline(inputStream, sharpInstance, passThrough, {signal: abortController.signal})
    .catch(error => {
        if (error.name !== 'AbortError') {
          console.error('Failure 1:', error);
        }
      }
    )

  const meta = await sharpInstance.metadata().catch(() => {
    abortController.abort()
  })
  if (!meta || !meta.width || !meta.height) {
    abortController.abort()
    throw new Error("Cannot get size of the picture")
  }
  let aspectRatio = NaN
  if (aspectRatioStr && _.isString(aspectRatioStr)) {
    const [xStr, yStr] = aspectRatioStr.trim().split(":");
    const x = _.toNumber(xStr)
    const y = _.toNumber(yStr)
    if (x && y) {
      aspectRatio = y / x
    }
  }

  const width = Math.max(minWidth, meta.width)
  const height = Math.max(minHeight, meta.height)
  let newWidth = width
  let newHeight = height
  if (aspectRatio) {
    newHeight = aspectRatio * width
    if (newHeight < height) {
      newHeight = height
      newWidth = height / aspectRatio
    }
  }
  const widthDiff = Math.max((newWidth - meta.width) / 2, 0);
  const heightDiff = Math.max((newHeight - meta.height) / 2, 0);

  const transformer = sharp().extend({
    left: _.isInteger(widthDiff) ? widthDiff : Math.floor(widthDiff),
    right: _.isInteger(widthDiff) ? widthDiff : Math.floor(widthDiff) + 1,
    bottom: _.isInteger(heightDiff) ? heightDiff : Math.floor(heightDiff),
    top: _.isInteger(heightDiff) ? heightDiff : Math.floor(heightDiff) + 1,
    background: "white"
  }).jpeg();

  return pipeline(
    passThrough,
    transformer,
    outputStream,
    {end: false} // This prevents closing the output stream
  ).then(() => {
    outputStream.end()
    })
    .catch((error) => {
      console.error('Image processing failed:', error);
      // outputStream is still open and can be used
      // You can write error data or continue processing
      throw error
    })
}

export async function resizePictureWithFrame(
  inputStream: ReadableStream,
  outputStream: Writable,
  frameUrl: string,
  photoWidth: number | undefined,
  photoLeft: number,
  photoTop: number
): Promise<void> {
  const abortController = new AbortController();
  const passThrough = new PassThrough();
  const sharpInstance = sharp();

  pipeline(inputStream, sharpInstance, passThrough, {signal: abortController.signal})
    .catch(error => {
        if (error.name !== 'AbortError') {
          console.error('Failure (frame/base pipeline):', error);
        }
      }
    )

  // Загружаем рамку с LRU-кешированием по URL
  const {buffer: frameBuffer, width: frameWidth, height: frameHeight} = await getFrameFromCache(frameUrl);

  const baseMeta = await sharpInstance.metadata().catch(() => {
    abortController.abort()
  })
  if (!baseMeta || !baseMeta.width || !baseMeta.height) {
    abortController.abort()
    throw new Error("Cannot get size of the picture")
  }

  if (!baseMeta.width || !baseMeta.height) {
    abortController.abort()
    throw new Error("Cannot get size of the base picture");
  }

  const origWidth = baseMeta.width;
  const origHeight = baseMeta.height;

  // Если width не передан, используем исходную ширину фото
  const targetWidth = photoWidth ?? origWidth;
  const targetHeight = Math.round((origHeight * targetWidth) / origWidth);

  // Вычисляем размеры финального изображения на основе позиции и размера фото
  // Ширина = максимум от (левого смещения + ширина фото, исходная ширина рамки)
  const finalWidth = Math.max(photoLeft + targetWidth, frameWidth);
  // Высота = максимум от (верхнего смещения + высота фото, исходная высота рамки)
  const finalHeight = Math.max(photoTop + targetHeight, frameHeight);

  // Один проход ресайза до нужного размера
  const resizedBuffer = await passThrough
    .pipe(sharp().resize(targetWidth, targetHeight))
    .toBuffer();

  // Создаём итоговое изображение: сначала кладём рамку, затем фото на нужные координаты
  const finalImage = sharp({
    create: {
      width: finalWidth,
      height: finalHeight,
      channels: 3,
      background: "white"
    }
  })
    .composite([
      {
        input: resizedBuffer,
        left: photoLeft,
        top: photoTop
      },
      {
        input: frameBuffer,
        left: 0,
        top: 0
      }
    ])
    .jpeg();

  return pipeline(
    passThrough,
    finalImage,
    outputStream,
    {end: false} // This prevents closing the output stream
  ).then(() => {
    outputStream.end()
  })
    .catch((error) => {
      console.error('Image processing failed:', error);
      // outputStream is still open and can be used
      // You can write error data or continue processing
      throw error
    })
}