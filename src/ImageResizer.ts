import _ from "lodash"
import sharp from "sharp"
import {PassThrough} from "stream";
import {pipeline} from "stream/promises";
import {Writable} from 'stream';

export async function resizePicture(inputStream: ReadableStream, outputStream: Writable, minWidth: number, minHeight: number, aspectRatioStr?: string): Promise<void> {
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
  const widthDiff = Math.max((newWidth - meta.width) / 2, 0)
  const heightDiff = Math.max((newHeight - meta.height) / 2, 0)

  return pipeline(passThrough, sharp()
      .extend({
        left: _.isInteger(widthDiff) ? widthDiff : Math.floor(widthDiff),
        right: _.isInteger(widthDiff) ? widthDiff : Math.floor(widthDiff) + 1,
        bottom: _.isInteger(heightDiff) ? heightDiff : Math.floor(heightDiff),
        top: _.isInteger(heightDiff) ? heightDiff : Math.floor(heightDiff) + 1,
        background: "white"
      })
      .png(), outputStream,
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