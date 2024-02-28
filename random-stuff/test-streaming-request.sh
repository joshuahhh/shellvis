# open duplicate of stderr for logging
exec {my_stderr}>&2

function generator {
  for i in {1..3}; do
    echo "hello $i"
    echo "sent 'hello $i'" >&$my_stderr
    sleep 0.2
  done
}

echo "before"
# generator | curl -X POST --data-binary @- localhost:1234
generator | curl -s -X POST -T - localhost:1234
echo "after"
echo
echo
