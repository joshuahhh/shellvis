# set -x

# open duplicate of stderr for logging
exec {fr_top_stderr}>&2

# messaging to fr

fr_msg () {
  [ $fr_debug ] && echo -E "sh: fr_msg gonna curl $1" >&$fr_top_stderr;
  curl -s -d $1 -H "Content-Type: text/plain" -X POST http://localhost:$fr_sh2fr_port;
  [ $fr_debug ] && echo -E "sh: fr_msg curl complete $1" >&$fr_top_stderr;
}

fr_upload () {
  [ $fr_debug ] && echo -E "sh: fr_upload gonna curl $1" >&$fr_top_stderr;
  curl -s -H "Content-Type: text/plain" -X POST --data-binary @- http://localhost:$fr_sh2fr_port/upload/$1;
  [ $fr_debug ] && echo -E "sh: fr_upload curl complete $1" >&$fr_top_stderr;
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

fr_typeset () {
  typeset | grep -E -i -v -e '(^| )fr_' -e ' zsh_eval_context=' -e ' LINENO='
}

# stateful initialization

frctx=()
