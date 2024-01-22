frmsg_init () {
  exec {fr2shFD}>$fr2sh
  exec {sh2frFD}<$sh2fr
}

frmsg_msg () {
  local -r MSG="$1"
  echo "$MSG" >&${fr2shFD}
}

frmsg_call () {
  frmsg_msg "$1"
  read -u "${sh2frFD}" RESPONSE
  echo "$RESPONSE"
}
