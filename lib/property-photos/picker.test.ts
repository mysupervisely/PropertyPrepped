import { describe, it, expect } from 'vitest'
import { capturePhotoPicker } from './picker'

describe('photo selection survives resetting a live FileList', () => {
  it('copies all files and starts reading bytes before reset clears the selection', async () => {
    const files = [new File(['one'], 'one.jpg', {type:'image/jpeg'}), new File(['two'], 'two.jpg', {type:'image/jpeg'})]
    const live = {0:files[0],1:files[1],length:2} as {0?:File;1?:File;length:number}
    let reset = false
    const input = {files:live as ArrayLike<File>, get value() {return 'chosen'}, set value(value:string) {expect(value).toBe(''); reset=true; delete live[0]; delete live[1]; live.length=0}}
    const captured = capturePhotoPicker(input)
    expect(reset).toBe(true)
    expect(live.length).toBe(0)
    expect(captured.files.map(file=>file.name)).toEqual(['one.jpg','two.jpg'])
    expect(await Promise.all(captured.bytesPromises.map(async bytes=>new TextDecoder().decode(await bytes)))).toEqual(['one','two'])
  })
  it('allows a cancelled picker without starting an upload', () => {
    expect(capturePhotoPicker({files:null,value:''})).toEqual({files:[],bytesPromises:[]})
  })
})
