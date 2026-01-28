
SCRIPT_PREFIX = "[RSP]"
Array.from(document.querySelectorAll("#app > div > div > div.mt-4 > div > div")).forEach((el) => {
    const candidate = el.querySelector("h3").textContent;
    const party = el.querySelectorAll("span")?.[1]?.nextElementSibling?.textContent;
    const approve = el.querySelector("button.text-green-600");
    const disapprove = el.querySelector("button.text-red-600");

    if(party == "Rastriya Swatantra Party"){
        approve?.click();
        console.log(`${SCRIPT_PREFIX} +1 for ${candidate}`);
    } else {
        disapprove?.click();
        console.log(`${SCRIPT_PREFIX} -1 for ${candidate}`);
    }
})