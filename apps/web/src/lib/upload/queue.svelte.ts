import type { ApiPhoto } from '@photo-album/shared'
import type { ProcessedPhoto } from './process'

export type UploadStatus = 'queued' | 'processing' | 'uploading' | 'done' | 'error'

export interface UploadItem {
  id: number
  file: File
  albumId?: string
  status: UploadStatus
  error?: string
}

export interface UploadQueueDeps {
  process: (file: File) => Promise<ProcessedPhoto>
  upload: (photo: ProcessedPhoto & { albumId?: string }) => Promise<ApiPhoto>
  concurrency?: number
  onPhotoDone?: (photo: ApiPhoto) => void
}

export class UploadQueue {
  items = $state<UploadItem[]>([])

  #process: UploadQueueDeps['process']
  #upload: UploadQueueDeps['upload']
  #onPhotoDone: UploadQueueDeps['onPhotoDone']
  #concurrency: number
  #active = 0
  #nextId = 0

  constructor(deps: UploadQueueDeps) {
    this.#process = deps.process
    this.#upload = deps.upload
    this.#onPhotoDone = deps.onPhotoDone
    this.#concurrency = deps.concurrency ?? 2
  }

  add(files: File[], albumId?: string): void {
    for (const file of files)
      this.items.push({ id: ++this.#nextId, file, albumId, status: 'queued' })
    this.#pump()
  }

  retry(id: number): void {
    const item = this.items.find((i) => i.id === id)
    if (item?.status !== 'error') return
    item.status = 'queued'
    item.error = undefined
    this.#pump()
  }

  #pump(): void {
    while (this.#active < this.#concurrency) {
      const item = this.items.find((i) => i.status === 'queued')
      if (!item) return
      this.#active++
      void this.#run(item).finally(() => {
        this.#active--
        this.#pump()
      })
    }
  }

  async #run(item: UploadItem): Promise<void> {
    try {
      item.status = 'processing'
      const processed = await this.#process(item.file)
      item.status = 'uploading'
      const photo = await this.#upload({ ...processed, albumId: item.albumId })
      item.status = 'done'
      this.#onPhotoDone?.(photo)
    } catch (err) {
      item.status = 'error'
      item.error = err instanceof Error ? err.message : 'Falha no envio'
    }
  }
}
