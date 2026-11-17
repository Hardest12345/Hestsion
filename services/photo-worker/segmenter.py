"""Pretrained segmentation adapter, shared by the worker and optional smoke test."""


def matte_mask(image, mask, matting):
    """Matte native pixels in bounded, padded tiles instead of a huge sparse solve."""
    from PIL import Image
    image = image.convert('RGB')
    if max(image.size) <= 1024:
        return matting(image, mask, 240, 10, 5)
    result = Image.new('RGBA', image.size)
    edge, padding = 512, 64
    for y in range(0, image.height, edge):
        for x in range(0, image.width, edge):
            core = (x, y, min(x+edge, image.width), min(y+edge, image.height))
            context = (max(0, x-padding), max(0, y-padding), min(image.width, core[2]+padding), min(image.height, core[3]+padding))
            patch_mask = mask.crop(context)
            low, high = patch_mask.getextrema()
            patch = image.crop(context)
            if high <= 10:
                patch = patch.convert('RGBA'); patch.putalpha(0)
            elif low >= 240:
                patch = patch.convert('RGBA')
            else:
                if low > 10 or high < 240:
                    raise ValueError('insufficient_matting_context')
                patch = matting(patch, patch_mask, 240, 10, 5)
            local = (core[0]-context[0], core[1]-context[1], core[2]-context[0], core[3]-context[1])
            result.paste(patch.crop(local), (x, y))
    return result


def create_segmenter():
    import os
    import onnxruntime
    onnxruntime.disable_telemetry_events()
    from rembg.sessions.birefnet_general_lite import BiRefNetSessionGeneralLite
    from rembg.bg import alpha_matting_cutout
    options = onnxruntime.SessionOptions()
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    options.execution_mode = onnxruntime.ExecutionMode.ORT_SEQUENTIAL
    options.intra_op_num_threads = max(1, min(4, int(os.environ.get('OMP_NUM_THREADS', '2'))))
    options.inter_op_num_threads = 1
    session = BiRefNetSessionGeneralLite('birefnet-general-lite', options, providers=['CPUExecutionProvider'])

    def segment(image):
        masks = session.predict(image)
        if len(masks) != 1:
            raise ValueError("unexpected_mask_count")
        # Call matting directly: an alpha-matting failure must not silently become
        # a lower-quality hard-mask result. Original photo remains safe for retry.
        return matte_mask(image, masks[0], alpha_matting_cutout)

    return segment
