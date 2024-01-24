# for now, there's only one "return address"
# this means no parallelism
# (then again, how will our file-tracking work with parallelism?)

# echo "frmsg.sh: loading"
# echo "frmsg.sh: fr2sh=$fr2sh"
# echo "frmsg.sh: sh2fr=$sh2fr"

# open duplicate of stderr for logging
exec {my_stderr}>&2

frmsg_init () {
  exec {sh2frFD}>$sh2fr
}

frmsg_send () {
  local -r MSG="$1"
  echo "$MSG" >&${sh2frFD}
}

frmsg_call () {
  (
    # TODO: noooo
    flock -x 9
    local -r fr_tmpfifo=$(fr_mktmpfifo)
    echo "sh: sending message at $fr_tmpfifo" >&${my_stderr}
    frmsg_send "$fr_tmpfifo,$1"
    # echo "sh: waiting for response at $fr_tmpfifo" >&${my_stderr}
    echo "sh: opening $fr_tmpfifo" >&${my_stderr}
    exec {fr_tmpfifoFD}< $fr_tmpfifo
    echo "sh: opened! reading from $fr_tmpfifo" >&${my_stderr}
    cat <&${fr_tmpfifoFD}
    echo "sh: done reading" >&${my_stderr}
    exec {fr_tmpfifoFD}<&-
    # cat $fr_tmpfifo
    echo "sh: response complete at $fr_tmpfifo" >&${my_stderr}
  ) 9>/tmp/frmsg.lock
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


frmsg_init
frctx_init

{
	local fr_stdout fr_stderr fr_ret
	frmsg_call "{\"type\":\"stmt-enter\",\"nodeId\":\"1_1_1_8\",\"context\":\"$(fr_join / ${frctx[@]})\",\"pwd\":\"$PWD\"}" | read -r fr_stdout fr_stderr
	x=$({
		local fr_stdout fr_stderr fr_ret
		frmsg_call "{\"type\":\"stmt-enter\",\"nodeId\":\"1_5_1_7\",\"context\":\"$(fr_join / ${frctx[@]})\",\"pwd\":\"$PWD\"}" | read -r fr_stdout fr_stderr
		ls \
			1>&1 1>$fr_stdout 2>&2 2>$fr_stderr
		fr_ret=$?
		frmsg_call "{\"type\":\"stmt-exit\",\"nodeId\":\"1_5_1_7\",\"context\":\"$(fr_join / ${frctx[@]})\",\"pwd\":\"$PWD\",\"exitCode\":$fr_ret}" | read -r fr_dummy
		fr_exitcode $fr_ret
	}) \
		1>&1 1>$fr_stdout 2>&2 2>$fr_stderr
	fr_ret=$?
	frmsg_call "{\"type\":\"stmt-exit\",\"nodeId\":\"1_1_1_8\",\"context\":\"$(fr_join / ${frctx[@]})\",\"pwd\":\"$PWD\",\"exitCode\":$fr_ret}" | read -r fr_dummy
	fr_exitcode $fr_ret
} # ls | rev
# sleep 1
# echo "hello" | rev
# sleep 1

# echo "#1" | echo "#2"

# echo "#1" | echo "#2" | echo "#3"

# false

# ls

# ls | rev

# echo "#2" | rev

# echo "#3"

# echo "#1"

# echo "#2A" | echo "#2B" | echo "2C"

# echo "#3"

# for i in {1..3}; do
#   echo "i=$i"
#   for j in {1..3}; do
#     echo "i,j=$i,$j"
#     # sleep 1
#   done
# done | rev

# true && echo "true" 1>&2
# false && echo "false" 1>&2

# for f in *.sh; do
#   # copy each $f from .sh to .txt
#   cp $f ${f%.sh}.doc
#   echo $f is cool
# done

# ls
