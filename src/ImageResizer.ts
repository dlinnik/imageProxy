import _ from "lodash"
import sharp from "sharp"
import {PassThrough} from "stream";
import {pipeline} from "stream/promises";
import { Writable } from 'stream';

export async function resizePicture(inputStream: ReadableStream, outputStream: Writable, minWidth: number, minHeight: number, aspectRatioStr?: string): Promise<void> {
    const passThrough = new PassThrough();

    const sharpInstance = sharp();

    pipeline(inputStream, sharpInstance, passThrough)

    const meta = await sharpInstance.metadata()
    if (!meta.width || !meta.height)
        throw new Error("Cannot get size of picture")
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

    return pipeline(passThrough, sharp().extend({
        left: _.isInteger(widthDiff) ? widthDiff : Math.floor(widthDiff),
        right: _.isInteger(widthDiff) ? widthDiff : Math.floor(widthDiff) + 1,
        bottom: _.isInteger(heightDiff) ? heightDiff : Math.floor(heightDiff),
        top: _.isInteger(heightDiff) ? heightDiff : Math.floor(heightDiff) + 1,
        background: "white"
    })
      .png(), outputStream)
}