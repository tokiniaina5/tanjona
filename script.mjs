// selectionner les éléments html
let container = document.querySelector('.container');
let btn = document.querySelector('.start-btn');
let scoreContainer = document.querySelector('.score');
let timeContainer = document.querySelector('.time');

btn. onclick = function() {
    // initialiser le score et le temps
    let score = 0;
    let time = 60; // 30 secondes
    container.innerHTML = ''; // vider le conteneur


    let interval = setInterval(function showTarget() {
        // créer une nouvelle cible
        let target = document.createElement('img');
        target.id = 'target';
          
        
        target.style.width = '60px';
        target.style.height = '60px';
        target.src = 'to.png';
        container.appendChild(target);
        target.style.top = Math.random() * (500 - target.offsetHeight) + 'px';
        target.style.left = Math.random() * (600 - target.offsetWidth) + 'px';

// faire disparaître la cible après 800 ms
        setTimeout(function() {
         target.remove();

        }, 20000);

        //clique sur le target
        target.onclick = function() {
            score += 1; // augmenter le score
         target.style.display = 'none';
 
        }
        time -= 1; // diminuer le temps
       

        //aficher les info
        scoreContainer.innerHTML = 'Score: ' + score;
        timeContainer.innerHTML = 'Time: ' + time + 's';

        // fin du jeux le temps est écoulé
        if (time == 0) {
            clearInterval(interval); // arrêter la création de cibles
            container.innerHTML = 'Game is finished!  ' ; // afficher le score final
        }
        

        



    }, 600); // créer une cible toutes les 1000 ms (1 seconde)
}