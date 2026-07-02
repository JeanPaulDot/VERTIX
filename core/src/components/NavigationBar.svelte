<script lang="ts">
	interface Props {
		currentPage: string;
	}
	const { currentPage }: Props = $props();
</script>
<nav>
	<ul id="n" class="clearfix">
		<li><a target="_blank" href="/">Play</a></li>
		<li class:sel={currentPage === "profile"}><a href="#">Profile</a></li>
		<li><a href="#">Achievements</a></li>
		<li><a href="#">Clans</a></li>
		<li class:sel={currentPage === "leaderboards"}><a href="./leaderboards.html">Leaderboards</a></li>
		<li><a href="#">Find Friends</a></li>
		<li class:sel={currentPage === "donate"}><a href="./donate.html">Donate</a></li>
	</ul>
</nav>
<style>
	a {
		color: #3c86b7;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	ul {
		line-height: 120%;
	}

	nav {
		width: auto;
		background-color: white;
		height: 45px;
		margin-bottom: 20px;
		box-shadow: inset 0 -5px #e0e0e0;
	}

	ul#n {
		width: 850px;
		margin: 0 auto;
		display: block;
		list-style: none;
	}

	ul#n li {
		float: left;
		line-height: 45px;
	}

	ul#n li a {
		display: block;
		padding: 0 11px;
		color: #969696;
		font-size: 15px;
		font-weight: bold;
		text-shadow: 0px 1px 1px #fff;
	}

	ul#n li.sel {
		background: #76b3e3;
		box-shadow: inset 0 -5px #4094d9;
	}

	ul#n li.sel a {
		color: #fff;
		text-shadow: none;
	}

	.clearfix:after {
		content: ".";
		display: block;
		clear: both;
		visibility: hidden;
		line-height: 0;
		height: 0;
	}

	.clearfix {
		display: inline-block;
	}
</style>
