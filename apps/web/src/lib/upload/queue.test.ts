import { describe, expect, it, vi } from 'vitest'
import type { ApiPhoto } from '@photo-album/shared'
import type { ProcessedPhoto } from './process'
import { UploadQueue } from './queue.svelte'

const processed: ProcessedPhoto = {
  file: new Blob(['f']),
  thumb: new Blob(['t']),
  width: 100,
  height: 100,
  takenAt: 1000,
}

const photo = { id: 'p1' } as ApiPhoto

function makeFile(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' })
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

describe('UploadQueue', () => {
  it('processa e envia todos os itens até done, passando o albumId', async () => {
    const upload = vi.fn().mockResolvedValue(photo)
    const onPhotoDone = vi.fn()
    const queue = new UploadQueue({
      process: vi.fn().mockResolvedValue(processed),
      upload,
      onPhotoDone,
    })
    queue.add([makeFile('a.jpg'), makeFile('b.jpg')], 'album-1')
    await vi.waitFor(() => expect(queue.items.every((i) => i.status === 'done')).toBe(true))
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload).toHaveBeenCalledWith({ ...processed, albumId: 'album-1' })
    expect(onPhotoDone).toHaveBeenCalledTimes(2)
  })

  it('respeita a concorrência máxima (2 por padrão)', async () => {
    const gates = [
      deferred<ProcessedPhoto>(),
      deferred<ProcessedPhoto>(),
      deferred<ProcessedPhoto>(),
    ]
    let started = 0
    const queue = new UploadQueue({
      process: vi.fn().mockImplementation(() => gates[started++]!.promise),
      upload: vi.fn().mockResolvedValue(photo),
    })
    queue.add([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')])
    await vi.waitFor(() => expect(started).toBe(2))
    expect(queue.items[2]!.status).toBe('queued')
    gates[0]!.resolve(processed)
    await vi.waitFor(() => expect(started).toBe(3))
    gates[1]!.resolve(processed)
    gates[2]!.resolve(processed)
    await vi.waitFor(() => expect(queue.items.every((i) => i.status === 'done')).toBe(true))
  })

  it('falha isolada: um item vai para error com mensagem, os outros concluem', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce(photo)
      .mockRejectedValueOnce(new Error('Arquivo grande demais'))
      .mockResolvedValueOnce(photo)
    const queue = new UploadQueue({ process: vi.fn().mockResolvedValue(processed), upload })
    queue.add([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')])
    await vi.waitFor(() =>
      expect(queue.items.map((i) => i.status)).toEqual(['done', 'error', 'done']),
    )
    expect(queue.items[1]!.error).toBe('Arquivo grande demais')
  })

  it('retry re-executa apenas o item que falhou', async () => {
    const upload = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValue(photo)
    const queue = new UploadQueue({ process: vi.fn().mockResolvedValue(processed), upload })
    queue.add([makeFile('a.jpg')])
    await vi.waitFor(() => expect(queue.items[0]!.status).toBe('error'))
    queue.retry(queue.items[0]!.id)
    await vi.waitFor(() => expect(queue.items[0]!.status).toBe('done'))
    expect(upload).toHaveBeenCalledTimes(2)
  })
})
