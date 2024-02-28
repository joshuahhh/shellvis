echo "hi!"

ls | rev | wc -l

diff <(ls) <(ls ..)
