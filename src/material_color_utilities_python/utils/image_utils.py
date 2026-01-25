import numpy as np

from ..quantize.quantizer_celebi import *
from ..score.score import *
from .color_utils import *


# /**
#  * Get the source color from an image.
#  *
#  * @param image The image element
#  * @return Source color - the color most suitable for creating a UI theme
#  */
def sourceColorFromImage(image):
    # // Convert Image data to Pixel Array
    # const imageBytes = await new Promise((resolve, reject) => {
    #     const canvas = document.createElement('canvas');
    #     const context = canvas.getContext('2d');
    #     if (!context) {
    #         return reject(new Error('Could not get canvas context'));
    #     }
    #     image.onload = () => {
    #         canvas.width = image.width;
    #         canvas.height = image.height;
    #         context.drawImage(image, 0, 0);
    #         resolve(context.getImageData(0, 0, image.width, image.height).data);
    #     };
    # });
    # // Convert Image data to Pixel Array
    # const pixels = [];
    # for (let i = 0; i < imageBytes.length; i += 4) {
    #     const r = imageBytes[i];
    #     const g = imageBytes[i + 1];
    #     const b = imageBytes[i + 2];
    #     const a = imageBytes[i + 3];
    #     if (a < 255) {
    #         continue;
    #     }
    #     const argb = argbFromRgb(r, g, b);
    #     pixels.push(argb);
    # }
    if image.mode == "RGB":
        image = image.convert("RGBA")
    if image.mode != "RGBA":
        print("Warning: Image not in RGB|RGBA format - Converting...")
        image = image.convert("RGBA")

    pixels = []
    for x in range(image.width):
        for y in range(image.height):
            # for the given pixel at w,h, lets check its value against the threshold
            pixel = image.getpixel((x, y))
            r = pixel[0]
            g = pixel[1]
            b = pixel[2]
            a = pixel[3]
            if a < 255:
                continue
            argb = argbFromRgb(r, g, b)
            pixels.append(argb)

    # // Convert Pixels to Material Colors
    result = QuantizerCelebi.quantize(pixels, 128)
    ranked = Score.score(result)

    # Fallback to dominant color if scoring fails (returns default blue)
    if len(ranked) == 1 and ranked[0] == 0xFF4285F4 and 0xFF4285F4 not in result:
        print("Info: No colorful seeds found. Validating dominant colors...")
        sorted_by_pop = sorted(result.items(), key=lambda item: item[1], reverse=True)
        if sorted_by_pop:
            ranked = [color for color, count in sorted_by_pop]

    top = ranked[0]
    return top


def topColorsFromImage(image) -> list[int]:
    """Get top 10 colors from image
    Args:
        image: PIL.Image

    Returns:
        list[str]: List of top 10 colors in hex format
    """
    if image.mode == "RGB":
        image = image.convert("RGBA")
    if image.mode != "RGBA":
        print("Warning: Image not in RGB|RGBA format - Converting...")
        image = image.convert("RGBA")

    pixel_array = np.array(image)
    pixels = pixel_array.reshape(
        -1, 4
    )  # Reshape to a 2D array of shape (num_pixels, 4)

    # Filter pixels based on alpha value and convert RGB to ARGB
    valid_pixels = pixels[pixels[:, 3] == 255]
    argb_pixels = np.empty((valid_pixels.shape[0],), dtype=np.uint32)
    argb_pixels = np.zeros((valid_pixels.shape[0],), dtype=np.uint32)

    argb_pixels |= valid_pixels[:, 3].astype(np.uint32) << 24
    argb_pixels |= valid_pixels[:, 0].astype(np.uint32) << 16
    argb_pixels |= valid_pixels[:, 1].astype(np.uint32) << 8
    argb_pixels |= valid_pixels[:, 2].astype(np.uint32)

    # Quantize and score the pixels
    argb_pixels = argb_pixels.tolist()

    result = QuantizerCelebi.quantize(argb_pixels, 128)

    # Filter out colors with low chroma (dull/grayish) to match matugen's logic
    # This prevents the scorer from picking a muddy color even if it's dominant
    from ..hct.cam16 import Cam16

    filtered_result = {
        color: count
        for color, count in result.items()
        if Cam16.fromInt(color).chroma >= 5.0
    }

    # Only use filtered result if we didn't filter everything out
    if filtered_result:
        result = filtered_result

    ranked = Score.score(result)

    # Fallback to dominant color if scoring fails (returns default blue)
    if len(ranked) == 1 and ranked[0] == 0xFF4285F4 and 0xFF4285F4 not in result:
        print("Info: No colorful seeds found. Validating dominant colors...")
        sorted_by_pop = sorted(result.items(), key=lambda item: item[1], reverse=True)
        if sorted_by_pop:
            ranked = [color for color, count in sorted_by_pop]
    if len(ranked) > 10:
        print(ranked[:10])
        return ranked[:10]

    return ranked
