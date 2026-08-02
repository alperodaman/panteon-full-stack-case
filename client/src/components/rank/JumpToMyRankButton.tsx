interface JumpToMyRankButtonProps {
  myRank: number | null
  rowRefs: React.MutableRefObject<Map<number, HTMLDivElement>>
}

export function JumpToMyRankButton({ myRank, rowRefs }: JumpToMyRankButtonProps) {
  if (myRank === null) return null

  const handleClick = () => {
    const node = rowRefs.current.get(myRank)
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    node.classList.add('animate-pulse')
    setTimeout(() => node.classList.remove('animate-pulse'), 1200)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-row border border-accent bg-bg-surface px-3 py-1.5 font-body text-sm text-accent hover:bg-me-bg"
    >
      Show my rank
    </button>
  )
}
