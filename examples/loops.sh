echo hi

for n in ; do
  echo "n=$n"
done

for n in {1..5}; do
  echo "n=$n"
done

for i in {1..3}; do
  echo "i=$i"
  for j in {1..3}; do
    echo "  j=$j -> i*j=$((i * j))"
  done
done

for n in *; do
  file $n
done

for n in $(echo "a\nb\nc"); do
  echo $n
done

for n in $(false); do
  echo $n
done
