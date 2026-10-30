// folder ../shared berisi tipe protokol yang dipakai bersama dengan itsvibes-server
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)
config.watchFolders = [path.resolve(__dirname, '../shared')]
module.exports = config
