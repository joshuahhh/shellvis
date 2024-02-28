# open duplicate of stderr for logging
exec {my_stderr}>&2

log_to_my_stderr () {
  while read -r line; do
    echo "$1: $line" >&$my_stderr
  done
}

target_command () {
  echo "here's some stdout!"
  echo "here's some stderr!" >&2
  echo "here's more stdout!"
  echo "here's more stderr!" >&2
}


# run target_command, prepending each line of stdout with STDOUT and each line
# of stderr with STDERR. also let each line of stdout/stderr come out naturally
# on stdout/stderr.

# {
#   {
#     target_command 1>&1 1>&3 2>&4 |
#     log_to_my_stderr STDOUT;
#   } 4>&1 4>&4 |
#   log_to_my_stderr STDERR;
# } 3>&1 4>&2

{
  target_command 1>&1 1> >(log_to_my_stderr STDOUT) 2>&2 2> >(log_to_my_stderr STDERR)
} 2> >(while read line; do echo -e "\e[01;31m$line\e[0m" >&2; done)
