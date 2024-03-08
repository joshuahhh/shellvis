# set -x

# open duplicate of stderr for logging
exec {fr_top_stderr}>&2

# messaging to fr

zmodload zsh/net/tcp

fr_msg () {
  [ $fr_debug ] && echo -E "sh: fr_msg gonna curl $1" >&$fr_top_stderr;
  ztcp localhost $fr_sh2fr_port
  fr_sh2fr_fd=$REPLY
  echo "message" >/dev/fd/$fr_sh2fr_fd
  echo $1 >/dev/fd/$fr_sh2fr_fd
  cat /dev/fd/$fr_sh2fr_fd
  ztcp -c $fr_sh2fr_fd
  [ $fr_debug ] && echo -E "sh: fr_msg curl complete $1" >&$fr_top_stderr;
}

fr_upload () {
  ztcp localhost $fr_sh2fr_port
  fr_sh2fr_fd=$REPLY
  echo "upload $1" >/dev/fd/$fr_sh2fr_fd
  cat >/dev/fd/$fr_sh2fr_fd
  ztcp -c $fr_sh2fr_fd
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
