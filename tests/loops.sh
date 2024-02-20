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
  echo "n=$n"
done
