exec {top_stdout}>&2

intercept_stdout () {
  while IFS= read -r line; do
    echo "intercepted stdout: $line" >&$top_stdout
  done
}

intercept_stderr () {
  while IFS= read -r line; do
    echo "intercepted stderr: $line" >&$top_stdout
  done
}

final_stdout () {
  while IFS= read -r line; do
    echo "final stdout: $line" >&$top_stdout
  done
}

final_stderr () {
  while IFS= read -r line; do
    echo "final stderr: $line" >&$top_stdout
  done
}

original_command () {
  echo "here's some stdout"
  echo "and here's some stderr" >&2
  return 42
}

local ret

# { { { { original_command ; ret1=$? ; x1=10 ; } 1>&5 2>&6 | intercept_stdout } 6>&6 6>&1 | intercept_stderr } 5>&1 6>&2 }  2> >(final_stderr) 1> >(final_stdout)
# echo "return value is $ret1"
# echo "x is $x1"

# { { { { original_command ; ret2=$? ; x2=10 ; } } } }
# echo "return value is $ret2"
# echo "x is $x2"

# { { { { original_command ; ret3=$? ; x3=10 ; } 1>&5 2>&6 } 6>&6 6>&1 } 5>&1 6>&2 }  2> >(final_stderr) 1> >(final_stdout)
# echo "return value is $ret3"
# echo "x is $x3"


original_command 1>&1 1> >(intercept_stdout) 2>&2 2> >(intercept_stderr)
