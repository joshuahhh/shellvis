# set -x

# open duplicate of stderr for logging
[ $fr_debug ] && exec {my_stderr}>&2

# messaging to fr

fr_msg () {
  [ $fr_debug ] && echo "sh: fr_msg gonna curl $1" >&$my_stderr;
  curl -s -d $1 -H "Content-Type: text/plain" -X POST http://localhost:1234;
  [ $fr_debug ] && echo "sh: fr_msg curl complete $1" >&$my_stderr;
}

fr_upload () {
  [ $fr_debug ] && echo "sh: fr_upload gonna curl $1" >&$my_stderr;
  curl -s -H "Content-Type: text/plain" -X POST --data-binary @- http://localhost:1234/upload/$1;
  [ $fr_debug ] && echo "sh: fr_upload curl complete $1" >&$my_stderr;
}

# maintaining 'context'

fr_ctx_push () {
  frctx+=("$1")
}

fr_ctx_pop () {
  # WARNING: we are now in zsh/bash incompatibility world
  shift -p frctx
}

fr_ctx_str () {
  if [ ${#frctx[@]} -eq 0 ]; then
    echo ""
  else
    echo "/$(fr_join / ${frctx[@]})"
  fi
}

# utiliies

fr_exitcode () {
  return $1
}

fr_join () {
  local IFS="$1"; shift; echo "$*";
}

# stateful initialization

frctx=()
