import Hypercore from 'hypercore'
import fs from 'bare-fs'
import b4a from 'b4a'
console.log('Hypercore Worklet started')

function time() {
    return Math.floor(Date.now() / 1000)
}

let path = Bare.argv[0]
if (path.includes('file://')) {
    path = path.replace('file://', '')
}

BareKit.IPC.on('data', async (data) => {

    const payload = JSON.parse(data.toString())

    if (payload.workType === 'write') {
        const core = new Hypercore(path + `/${time()}`)
        await core.ready()

        let i = 1
        do {
            await core.append(Buffer.from(`${i}`))
            i++
        } while (i !== payload.recordsAmount + 1)

        const block = await core.get(core.length - 1)
        BareKit.IPC.write(JSON.stringify([{records: block.toString()}]))

        await core.close()
    } else if (payload.workType === 'read') {
        let core
        console.log('Barely 1')
        if (fs.existsSync(path + '/readtest')) {
        console.log('Barely 2')
            const core = new Hypercore(path + '/readtest');
            await core.ready()
            let i = 0
            for (i = 0; i < (payload.recordsAmount); i++) {
                const randomBlock = Math.floor(Math.random() * 999999);
                const block = await core.get(randomBlock);
            }
            BareKit.IPC.write(JSON.stringify([{records: i}]));
            await core.close();

        } else {
            core = new Hypercore(path + '/readtest')
            await core.ready()

            let i = 1
            do {
                await core.append(Buffer.from(`${time()}`))
                i++
            } while (i !== 1000000)

            const block = await core.get(core.length - 1)
            BareKit.IPC.write(JSON.stringify([{records: block.toString()}]))

            await core.close()
        }

    }


})
