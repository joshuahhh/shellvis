# set -x

# open duplicate of stderr for logging
exec {my_stderr}>&2

frmsg_init () {
}

frmsg_call () {
  # echo "sh: frmsg_call gonna curl $1" >&$my_stderr;
  curl -s -d $1 -H "Content-Type: text/plain" -X POST http://localhost:1234;
  # echo "sh: frmsg_call curl complete $1" >&$my_stderr;
}

frmsg_upload () {
  # echo "sh: frmsg_upload gonna curl $1" >&$my_stderr;
  curl -s -H "Content-Type: text/plain" -X POST --data-binary @- http://localhost:1234/upload/$1;
  # echo "sh: frmsg_upload curl complete $1" >&$my_stderr;
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
