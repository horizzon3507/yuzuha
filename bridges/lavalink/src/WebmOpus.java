package dev.yuzuha.audio;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

final class WebmOpus {
    static final byte[] SILENCE = {(byte) 0xf8, (byte) 0xff, (byte) 0xfe};
    static final byte[] HEADER = header();
    private WebmOpus() {}

    private static byte[] bytes(int... values) {
        byte[] result = new byte[values.length];
        for (int i = 0; i < values.length; i++) result[i] = (byte) values[i];
        return result;
    }

    private static byte[] concat(byte[]... values) {
        var result = new ByteArrayOutputStream();
        for (byte[] value : values) result.writeBytes(value);
        return result.toByteArray();
    }

    private static byte[] size(int value) {
        if (value < 127) return bytes(0x80 | value);
        if (value < 16383) return bytes(0x40 | (value >> 8), value);
        return bytes(0x20 | (value >> 16), value >> 8, value);
    }

    private static byte[] element(byte[] id, byte[] value) { return concat(id, size(value.length), value); }
    private static byte[] number(byte[] id, long value) {
        int length = 1;
        while (length < 8 && value >>> (length * 8) != 0) length++;
        byte[] result = new byte[length];
        for (int i = 0; i < length; i++) result[length - i - 1] = (byte) (value >>> (i * 8));
        return element(id, result);
    }
    private static byte[] text(byte[] id, String value) { return element(id, value.getBytes(StandardCharsets.UTF_8)); }

    static byte[] header() {
        byte[] ebml = element(bytes(0x1a, 0x45, 0xdf, 0xa3), concat(
            number(bytes(0x42, 0x86), 1), number(bytes(0x42, 0xf7), 1),
            number(bytes(0x42, 0xf2), 4), number(bytes(0x42, 0xf3), 8),
            text(bytes(0x42, 0x82), "webm"), number(bytes(0x42, 0x87), 4), number(bytes(0x42, 0x85), 2)));
        byte[] info = element(bytes(0x15, 0x49, 0xa9, 0x66), concat(
            number(bytes(0x2a, 0xd7, 0xb1), 1_000_000), text(bytes(0x4d, 0x80), "Yuzuha"), text(bytes(0x57, 0x41), "Yuzuha")));
        byte[] opusHead = ByteBuffer.allocate(19).order(ByteOrder.LITTLE_ENDIAN)
            .put("OpusHead".getBytes(StandardCharsets.US_ASCII)).put((byte) 1).put((byte) 2)
            .putShort((short) 0).putInt(48000).putShort((short) 0).put((byte) 0).array();
        byte[] audio = element(bytes(0xe1), concat(
            element(bytes(0xb5), ByteBuffer.allocate(8).putDouble(48000).array()), number(bytes(0x9f), 2)));
        byte[] entry = element(bytes(0xae), concat(number(bytes(0xd7), 1), number(bytes(0x73, 0xc5), 1),
            number(bytes(0x83), 2), text(bytes(0x86), "A_OPUS"), element(bytes(0x63, 0xa2), opusHead),
            number(bytes(0x56, 0xaa), 0), number(bytes(0x56, 0xbb), 80_000_000), audio));
        return concat(ebml, bytes(0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff),
            info, element(bytes(0x16, 0x54, 0xae, 0x6b), entry));
    }

    private static int sizeLength(int value) { return value < 127 ? 1 : value < 16383 ? 2 : 3; }
    private static int putSize(byte[] output, int offset, int value) {
        int length = sizeLength(value);
        for (int i = length - 1; i >= 0; i--) output[offset++] = (byte) (value >>> (8 * i));
        output[offset - length] |= (byte) (0x80 >>> (length - 1));
        return offset;
    }
    static byte[] frame(long time, byte[] opus, int length) {
        int timeBytes = 1;
        while (timeBytes < 8 && time >>> (8 * timeBytes) != 0) timeBytes++;
        int blockSize = 4 + length;
        int clusterSize = 2 + timeBytes + 1 + sizeLength(blockSize) + blockSize;
        byte[] output = new byte[4 + sizeLength(clusterSize) + clusterSize];
        output[0] = 0x1f; output[1] = 0x43; output[2] = (byte) 0xb6; output[3] = 0x75;
        int offset = putSize(output, 4, clusterSize);
        output[offset++] = (byte) 0xe7; output[offset++] = (byte) (0x80 | timeBytes);
        for (int i = timeBytes - 1; i >= 0; i--) output[offset++] = (byte) (time >>> (8 * i));
        output[offset++] = (byte) 0xa3; offset = putSize(output, offset, blockSize);
        output[offset++] = (byte) 0x81; output[offset++] = 0; output[offset++] = 0; output[offset++] = (byte) 0x80;
        System.arraycopy(opus, 0, output, offset, length);
        return output;
    }
}
