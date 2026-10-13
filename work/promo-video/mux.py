# -*- coding: utf-8 -*-
"""把 WebCodecs 編碼結果（enc/index.json、video.bin、audio.bin）封裝為標準 MP4。
純標準函式庫。用法：py -3 mux.py enc out.mp4
"""
import base64
import json
import os
import struct
import sys


def box(typ, payload):
    return struct.pack('>I4s', 8 + len(payload), typ) + payload


def fullbox(typ, version, flags, payload):
    return box(typ, struct.pack('>I', (version << 24) | flags) + payload)


MATRIX = struct.pack('>9i', 0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000)


def mvhd(timescale, duration, next_track):
    return fullbox(b'mvhd', 0, 0, struct.pack('>IIII', 0, 0, timescale, duration) + struct.pack('>IH', 0x00010000, 0x0100) + b'\0' * 10 + MATRIX + b'\0' * 24 + struct.pack('>I', next_track))


def tkhd(track_id, duration, width=0, height=0, audio=False):
    return fullbox(b'tkhd', 0, 3, struct.pack('>IIII', 0, 0, track_id, 0) + struct.pack('>I', duration) + b'\0' * 8 + struct.pack('>HHHH', 0, 0, 0x0100 if audio else 0, 0) + MATRIX + struct.pack('>II', width << 16, height << 16))


def mdhd(timescale, duration):
    return fullbox(b'mdhd', 0, 0, struct.pack('>IIII', 0, 0, timescale, duration) + struct.pack('>HH', 0x55C4, 0))


def hdlr(handler, name):
    return fullbox(b'hdlr', 0, 0, b'\0' * 4 + handler + b'\0' * 12 + name.encode() + b'\0')


def dinf():
    return box(b'dinf', fullbox(b'dref', 0, 0, struct.pack('>I', 1) + fullbox(b'url ', 0, 1, b'')))


def avc1_entry(width, height, avcc):
    name = b'\x0eWebCodecs H264'.ljust(32, b'\0')
    payload = b'\0' * 6 + struct.pack('>H', 1) + b'\0' * 16 + struct.pack('>HH', width, height) + struct.pack('>II', 0x00480000, 0x00480000) + b'\0' * 4 + struct.pack('>H', 1) + name + struct.pack('>Hh', 0x0018, -1)
    return box(b'avc1', payload + box(b'avcC', avcc))


def esds(asc, max_bitrate=256000, avg_bitrate=192000):
    dsi = bytes([0x05, len(asc)]) + asc
    dcd_payload = bytes([0x40, 0x15]) + b'\0\0\0' + struct.pack('>II', max_bitrate, avg_bitrate) + dsi
    dcd = bytes([0x04, len(dcd_payload)]) + dcd_payload
    sl = bytes([0x06, 0x01, 0x02])
    es_payload = struct.pack('>HB', 0, 0) + dcd + sl
    es = bytes([0x03, len(es_payload)]) + es_payload
    return fullbox(b'esds', 0, 0, es)


def mp4a_entry(sample_rate, channels, asc):
    payload = b'\0' * 6 + struct.pack('>H', 1) + b'\0' * 8 + struct.pack('>HHHH', channels, 16, 0, 0) + struct.pack('>I', sample_rate << 16)
    return box(b'mp4a', payload + esds(asc))


def runs(values):
    out = []
    for v in values:
        if out and out[-1][1] == v:
            out[-1][0] += 1
        else:
            out.append([1, v])
    return out


def stbl(entry, samples, chunk_offsets, chunk_counts, video):
    """samples: list of dict(size, dur, key, cto)"""
    out = fullbox(b'stsd', 0, 0, struct.pack('>I', 1) + entry)
    r = runs([s['dur'] for s in samples])
    out += fullbox(b'stts', 0, 0, struct.pack('>I', len(r)) + b''.join(struct.pack('>II', c, d) for c, d in r))
    if any(s['cto'] for s in samples):
        r = runs([s['cto'] for s in samples])
        ver = 1 if any(d < 0 for _, d in r) else 0
        out += fullbox(b'ctts', ver, 0, struct.pack('>I', len(r)) + b''.join(struct.pack('>Ii' if ver else '>II', c, d) for c, d in r))
    if video:
        sync = [i + 1 for i, s in enumerate(samples) if s['key']]
        out += fullbox(b'stss', 0, 0, struct.pack('>I', len(sync)) + b''.join(struct.pack('>I', i) for i in sync))
    sc = []
    for i, n in enumerate(chunk_counts):
        if not sc or sc[-1][1] != n:
            sc.append((i + 1, n))
    out += fullbox(b'stsc', 0, 0, struct.pack('>I', len(sc)) + b''.join(struct.pack('>III', f, n, 1) for f, n in sc))
    out += fullbox(b'stsz', 0, 0, struct.pack('>II', 0, len(samples)) + b''.join(struct.pack('>I', s['size']) for s in samples))
    out += fullbox(b'co64', 0, 0, struct.pack('>I', len(chunk_offsets)) + b''.join(struct.pack('>Q', o) for o in chunk_offsets))
    return box(b'stbl', out)


def mux(enc_dir, dst, chunk_seconds=0.5):
    index = json.load(open(os.path.join(enc_dir, 'index.json'), encoding='utf-8'))
    vbin = open(os.path.join(enc_dir, 'video.bin'), 'rb').read()
    abin = open(os.path.join(enc_dir, 'audio.bin'), 'rb').read()
    fps = index['fps']
    V_TS, A_TS, MV_TS = 30000, index['audio']['sampleRate'], 1000
    # 影片樣本：固定每格 V_TS/fps；輸出順序即解碼順序，cto = pts - dts
    vs, off = [], 0
    for i, c in enumerate(index['video']['chunks']):
        dts = round(i * V_TS / fps)
        pts = round(c['ts'] * V_TS / 1e6)
        vs.append(dict(off=off, size=c['size'], dur=round(V_TS / fps), key=c['key'], cto=pts - dts))
        off += c['size']
    assert off == len(vbin), (off, len(vbin))
    # 音訊樣本：AAC 每 frame 1024 個取樣
    au, off = [], 0
    for c in index['audio']['chunks']:
        dur = round(c['dur'] * A_TS / 1e6) if c.get('dur') else 1024
        au.append(dict(off=off, size=c['size'], dur=dur, key=True, cto=0))
        off += c['size']
    assert off == len(abin), (off, len(abin))
    tracks = [dict(id=1, ts=V_TS, samples=vs, data=vbin, video=True), dict(id=2, ts=A_TS, samples=au, data=abin, video=False)]
    # 交錯 mdat
    mdat = bytearray()
    chunks = {t['id']: ([], []) for t in tracks}
    cursor = {t['id']: 0 for t in tracks}
    tpos = {t['id']: 0 for t in tracks}
    while any(cursor[t['id']] < len(t['samples']) for t in tracks):
        t = min((t for t in tracks if cursor[t['id']] < len(t['samples'])), key=lambda t: tpos[t['id']] / t['ts'])
        tid = t['id']
        limit = tpos[tid] + chunk_seconds * t['ts']
        n = 0
        chunks[tid][0].append(len(mdat))
        while cursor[tid] + n < len(t['samples']) and (n == 0 or tpos[tid] < limit):
            s = t['samples'][cursor[tid] + n]
            mdat += t['data'][s['off']:s['off'] + s['size']]
            tpos[tid] += s['dur']
            n += 1
        chunks[tid][1].append(n)
        cursor[tid] += n
    durations = {t['id']: sum(s['dur'] for s in t['samples']) for t in tracks}
    movie_dur = max(round(durations[t['id']] * MV_TS / t['ts']) for t in tracks)
    avcc = base64.b64decode(index['video']['desc'])
    asc = base64.b64decode(index['audio']['desc'])
    W, H = index['width'], index['height']

    def build_moov(base):
        out = mvhd(MV_TS, movie_dur, 3)
        for t in tracks:
            tid = t['id']
            offsets = [base + o for o in chunks[tid][0]]
            if t['video']:
                entry = avc1_entry(W, H, avcc)
                minf = box(b'minf', fullbox(b'vmhd', 0, 1, b'\0' * 8) + dinf() + stbl(entry, t['samples'], offsets, chunks[tid][1], True))
                mdia = box(b'mdia', mdhd(t['ts'], durations[tid]) + hdlr(b'vide', 'VideoHandler') + minf)
                out += box(b'trak', tkhd(tid, round(durations[tid] * MV_TS / t['ts']), W, H) + mdia)
            else:
                entry = mp4a_entry(t['ts'], index['audio']['channels'], asc)
                minf = box(b'minf', fullbox(b'smhd', 0, 0, b'\0' * 4) + dinf() + stbl(entry, t['samples'], offsets, chunks[tid][1], False))
                mdia = box(b'mdia', mdhd(t['ts'], durations[tid]) + hdlr(b'soun', 'SoundHandler') + minf)
                out += box(b'trak', tkhd(tid, round(durations[tid] * MV_TS / t['ts']), audio=True) + mdia)
        return box(b'moov', out)

    ftyp = box(b'ftyp', b'isom' + struct.pack('>I', 512) + b'isomiso2avc1mp41')
    moov_len = len(build_moov(0))
    base = len(ftyp) + moov_len + 8
    moov = build_moov(base)
    assert len(moov) == moov_len
    with open(dst, 'wb') as f:
        f.write(ftyp)
        f.write(moov)
        f.write(struct.pack('>I4s', 8 + len(mdat), b'mdat'))
        f.write(mdat)
    for t in tracks:
        print('track', t['id'], 'video' if t['video'] else 'audio', 'samples', len(t['samples']), 'duration %.3fs' % (durations[t['id']] / t['ts']), 'chunks', len(chunks[t['id']][0]))
    print('movie %.3fs' % (movie_dur / MV_TS), 'wrote', dst, base + len(mdat), 'bytes')


if __name__ == '__main__':
    mux(sys.argv[1], sys.argv[2])
