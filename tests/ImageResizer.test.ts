import sharp from "sharp"
import fs from 'fs'
import {expect} from "chai";

import {resizePicture, resizePictureWithFrame} from "../src/ImageResizer.ts"
import {fileURLToPath} from 'url';
import {dirname} from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function processImage(origImgName: String, params: Record<string, number | string>, destImgName: string) {
    const readableStream = fs.createReadStream(`${__dirname}/resources/${origImgName}`);
    const outFile = `${__dirname}/resources/${destImgName}`;
    await resizePicture(readableStream, fs.createWriteStream(outFile), params['Мин. ширина'] as number, params['Мин. высота'] as number, params['Соотношение сторон'] as string);
    const expectedSize = destImgName.split(/[_.]/)[2]
    const meta = await sharp(outFile).metadata();
    expect(`${meta.width}x${meta.height}`).to.be.equal(expectedSize, `${destImgName} has wrong size, expected ${expectedSize}`)
}

async function processImageWithFrame(origImgName: String, padding: number, destImgName: string) {
    const readableStream = fs.createReadStream(`${__dirname}/resources/${origImgName}`);
    const outFile = `${__dirname}/resources/${destImgName}`;
    const framePath = `${__dirname}/resources/frame_480x640.png`;
    const frameBuffer = fs.readFileSync(framePath);
    const frameDataUrl = `data:image/png;base64,${frameBuffer.toString('base64')}`;

    await resizePictureWithFrame(readableStream, fs.createWriteStream(outFile), frameDataUrl, padding);

    const meta = await sharp(outFile).metadata();
    expect(`${meta.width}x${meta.height}`).to.be.equal('480x640', `${destImgName} has wrong size, expected 480x640`);
    expect(meta.format).to.be.equal('jpeg', `${destImgName} should be jpeg`);
}

describe('Image resizer', function () {

    it('should extend horizontal images', async () => {
        await processImage('himeji_640x480.jpg', {'Мин. ширина': 800, 'Мин. высота': 700,}, 'himeji_resized_800x700.jpg');
        await processImage('himeji_640x480.jpg', {'Мин. ширина': 300, 'Мин. высота': 300,}, 'himeji_resized_640x480.jpg');
        await processImage('himeji_640x480.jpg', {'Мин. ширина': 300, 'Мин. высота': 300, 'Соотношение сторон': '1:1'}, 'himeji_resized_640x640.jpg');
        await processImage('himeji_640x480.jpg', {'Мин. ширина': 641, 'Мин. высота': 300, 'Соотношение сторон': '1:1'}, 'himeji_resized_641x641.jpg');
        await processImage('himeji_640x480.jpg', {'Мин. ширина': 300, 'Мин. высота': 300, 'Соотношение сторон': '3:4'}, 'himeji_resized_640x853.jpg');
        await processImage('himeji_640x480.jpg', {'Мин. ширина': 700, 'Мин. высота': 700, 'Соотношение сторон': '4:3'}, 'himeji_resized_933x700.jpg');
    })

    it('should extend vertical images', async () => {
        await processImage('gastro_400x566.png', {'Мин. ширина': 800, 'Мин. высота': 700,}, 'gastro_resized_800x700.png');
        await processImage('gastro_400x566.png', {'Мин. ширина': 300, 'Мин. высота': 300,}, 'gastro_resized_400x566.png');
        await processImage('gastro_400x566.png', {'Мин. ширина': 300, 'Мин. высота': 300, 'Соотношение сторон': '1:1'}, 'gastro_resized_566x566.png');
        await processImage('gastro_400x566.png', {'Мин. ширина': 300, 'Мин. высота': 300, 'Соотношение сторон': '1:1'}, 'gastro_resized_566x566.png');
    })

    it('should resize and apply frame (jpeg, size equals frame)', async () => {
        await processImageWithFrame('himeji_640x480.jpg', 0, 'himeji_framed_480x640.jpg');
    })

    it('should respect padding but keep output size equals frame', async () => {
        await processImageWithFrame('himeji_640x480.jpg', 40, 'himeji_framed_padding40_480x640.jpg');
        await processImageWithFrame('gastro_400x566.png', 40, 'gastro_framed_padding40_480x640.jpg');
    })
})