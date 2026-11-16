const protocol = require('./lib/protocol')

exports.Client = require('./lib/client')

exports.SERVICE_UUID = protocol.SERVICE_UUID
exports.TO_RADIO_UUID = protocol.TO_RADIO_UUID
exports.FROM_RADIO_UUID = protocol.FROM_RADIO_UUID
exports.FROM_NUM_UUID = protocol.FROM_NUM_UUID

exports.BROADCAST = protocol.BROADCAST
exports.CHANNEL_DISABLED = protocol.CHANNEL_DISABLED
exports.CHANNEL_PRIMARY = protocol.CHANNEL_PRIMARY
exports.CHANNEL_PSK_SIZE = protocol.CHANNEL_PSK_SIZE
exports.CHANNEL_NAME_SIZE = protocol.CHANNEL_NAME_SIZE
exports.PORT_TEXT_MESSAGE = protocol.PORT_TEXT_MESSAGE
exports.PORT_ADMIN = protocol.PORT_ADMIN
exports.MAX_PAYLOAD = protocol.MAX_PAYLOAD

exports.decode = protocol.decode
exports.decodeAdmin = protocol.decodeAdmin
exports.wantConfig = protocol.wantConfig
exports.textMessage = protocol.textMessage
exports.getChannel = protocol.getChannel
exports.setChannel = protocol.setChannel
exports.nodeId = protocol.nodeId
