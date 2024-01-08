echo "go time!"

for i in {1..10}
do
  echo -n "Welcome $i times"
  # write to stderr
  echo " & some stderr" 1>&2
  sleep 0.2
  echo "fun file" > "fun$i.txt"
done

echo "all done"
