# set -x

# HACK to restore nasty bash behavior for study
setopt shwordsplit

# open duplicate of stderr for logging
exec {fr_top_stderr}>&2

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
