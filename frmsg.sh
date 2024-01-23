# for now, there's only one "return address"
# this means no parallelism
# (then again, how will our file-tracking work with parallelism?)

# echo "frmsg.sh: loading"
# echo "frmsg.sh: fr2sh=$fr2sh"
# echo "frmsg.sh: sh2fr=$sh2fr"

frmsg_init () {
  exec {fr2shFD}>$fr2sh
  exec {sh2frFD}<$sh2fr
}

frmsg_send () {
  local -r MSG="$1"
  echo "$MSG" >&${fr2shFD}
}

frmsg_call () {
  frmsg_send "$1"
  echo "about to read"
  read -u "${sh2frFD}" RESPONSE
  echo "done reading"
  echo "$RESPONSE"
}

frctx_init () {
  frctx=()
}

frctx_push () {
  frctx+=("$1")
}

frctx_pop () {
  # WARNING: we are now in zsh/bash incompatibility world
  shift -p frctx
}

fr_exitcode () {
  return $1
}
