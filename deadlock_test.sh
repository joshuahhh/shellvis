exec {my_stderr}>&2

{
  fr_tmpfifo=pipe1
  echo "$fr_tmpfifo running" >&${my_stderr}
  exec {fr_tmpfifoFD}< $fr_tmpfifo
	echo "$fr_tmpfifo opened" >&${my_stderr}
	cat <&${fr_tmpfifoFD}
  echo "$fr_tmpfifo done reading" >&${my_stderr}
	exec {fr_tmpfifoFD}<&-
  sleep 5
} | {
  fr_tmpfifo=pipe2
  echo "$fr_tmpfifo running" >&${my_stderr}
  exec {fr_tmpfifoFD}< $fr_tmpfifo
	echo "$fr_tmpfifo opened" >&${my_stderr}
	cat <&${fr_tmpfifoFD}
  echo "$fr_tmpfifo done reading" >&${my_stderr}
	exec {fr_tmpfifoFD}<&-
  sleep 5
}
