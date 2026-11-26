const { Window } = require('bare-native')
const mainView = require('./main-view')

const modules = [require('./modules/os'), require('./modules/bluetooth')]

const window = new Window(420, 760)

window.content(mainView(modules))
window.show()
