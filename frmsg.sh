# for now, there's only one "return address"
# this means no parallelism
# (then again, how will our file-tracking work with parallelism?)

# echo "frmsg.sh: loading"
# echo "frmsg.sh: fr2sh=$fr2sh"
# echo "frmsg.sh: sh2fr=$sh2fr"

frmsg_init () {
  exec {sh2frFD}>$sh2fr
}

frmsg_send () {
  local -r MSG="$1"
  echo "$MSG" >&${sh2frFD}
}

frmsg_call () {
  fr_tmpfifo=$(fr_mktmpfifo)
  frmsg_send "$fr_tmpfifo,$1"
  cat $fr_tmpfifo
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

fr_join () {
  local IFS="$1"; shift; echo "$*";
}

# TODO: replace with pool, etc
fr_mktmpfifo () {
  local -r TMPFIFO=$(mktemp -u)
  mkfifo $TMPFIFO
  echo $TMPFIFO
}
